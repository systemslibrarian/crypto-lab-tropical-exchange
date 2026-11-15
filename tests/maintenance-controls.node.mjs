import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * The publishing controls, asserted rather than assumed.
 *
 * These run inside `npm run build`, so a workflow edit that quietly removes
 * the pull-request gate, the deploy dispatch or an action pin fails the build
 * that would have shipped it — rather than being noticed months later when a
 * bump merges against nothing and the site stops updating.
 *
 * Every assertion here corresponds to a failure this fleet actually had.
 */

const root = new URL('../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/deploy.yml', root), 'utf8');
const dependabot = readFileSync(new URL('.github/dependabot.yml', root), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
const gitignore = readFileSync(new URL('.gitignore', root), 'utf8');
const playwrightConfig = readFileSync(new URL('playwright.config.ts', root), 'utf8');
const dom = readFileSync(new URL('src/ui/dom.ts', root), 'utf8');

function job(name) {
  const pattern = '\\n  ' + name + ':\\n[\\s\\S]*?(?=\\n  [a-z][a-z0-9-]*:\\n|$)';
  const match = workflow.match(new RegExp(pattern));
  assert.ok(match, `missing ${name} job`);
  return match[0];
}

test('one workflow owns the pull-request gate and the Pages deployment', () => {
  assert.equal(existsSync(new URL('.github/workflows/ci.yml', root)), false);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('the concurrency group includes the ref', () => {
  // A bare `pages` group with cancel-in-progress lets a pull-request run
  // cancel a live deployment of main.
  assert.match(workflow, /group: pages-\$\{\{ github\.ref \}\}/);
  assert.doesNotMatch(workflow, /group: pages\n/);
});

test('only the deploy job can mint Pages credentials', () => {
  const header = workflow.slice(0, workflow.indexOf('\njobs:'));
  assert.match(header, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(header, /pages: write|id-token: write/);
  assert.doesNotMatch(job('build'), /pages: write|id-token: write/);
  assert.match(
    job('deploy'),
    /permissions:\n      contents: read\n      pages: write\n      id-token: write\n/,
  );
});

test('every third-party action is pinned to an immutable commit', () => {
  // Both step shapes: `- uses:` and a `uses:` under a `- name:`. A pattern
  // that reads only one of them leaves the other unpinned and unreported.
  const actions = [...workflow.matchAll(/^[ \t]*(?:-[ \t]+)?uses:[ \t]+([^@\s]+)@([^\s]+)/gm)];

  // A declared denominator: every `uses:` line present must be a `uses:` line
  // parsed, so a step in a shape neither pattern can read fails here instead
  // of passing unseen.
  const present = workflow.match(/^[ \t]*(?:-[ \t]+)?uses:/gm) ?? [];
  assert.equal(
    actions.length,
    present.length,
    `${present.length - actions.length} uses: line(s) this control cannot read`,
  );
  assert.ok(actions.length > 0, 'workflow has no actions');
  for (const [, action, reference] of actions) {
    assert.match(reference, /^[0-9a-f]{40}$/, `${action} is not commit-pinned`);
  }
});

test('the whole suite gates a publish, not only the browser half', () => {
  // A 2026-08-14 sweep found 29 repos whose deploy job ran the a11y gate
  // alone, so their unit and algorithmic suites never blocked a publish. Here
  // the unit tests, the measured-rate suite and the build all run before the
  // artifact is uploaded.
  const build = job('build');
  assert.match(build, /run: npm ci/);
  assert.match(build, /run: npm test\n/);
  assert.match(build, /run: npm run test:slow/);
  assert.match(build, /run: npm run build/);
  assert.match(
    build,
    /name: Upload Pages artifact\n\s+if: github\.event_name != 'pull_request'\n\s+uses: actions\/upload-pages-artifact@[0-9a-f]{40}/,
  );

  const browser = job('browser-gate');
  assert.match(browser, /run: npm ci/);
  assert.match(browser, /npx playwright test/);
  // The mutation ledger runs in CI too: a guard CI never runs is decoration,
  // and a recorded kill nobody replays is a sentence about a run that happened
  // once.
  // Matched as a COMMAND rather than as a whole `run:` line: the step is a
  // block scalar so it can mark the workspace safe for git first, and a
  // pattern anchored to `run:` would read that as the ledger having been
  // removed. The question is whether the command runs, not how it is spelled.
  assert.match(browser, /npm run test:mutation/);
  // Never `--with-deps`: that apt step wedged 547 CI runs in one afternoon.
  // This job uses the pinned container image instead.
  assert.doesNotMatch(browser, /--with-deps/);

  assert.match(job('deploy'), /needs: \[build, browser-gate\]/);
  // The gate a bump auto-merges against must be the gate the deploy runs.
  assert.match(job('dependabot-auto-merge'), /needs: \[build, browser-gate\]/);
});

test('the deploy is gated on != pull_request, never on == push', () => {
  // They read as equivalent and are not: `== 'push'` also skips
  // workflow_dispatch, which disables the post-merge deploy entirely.
  assert.match(job('deploy'), /if: github\.event_name != 'pull_request'/);
  assert.doesNotMatch(workflow, /github\.event_name == 'push'/);
});

test('the browser image matches the installed Playwright and is immutable', () => {
  const version = packageLock.packages['node_modules/@playwright/test'].version;
  assert.equal(version, packageLock.packages['node_modules/playwright-core'].version);
  assert.match(
    job('browser-gate'),
    new RegExp(`image: mcr\\.microsoft\\.com/playwright:v${version}-noble@sha256:[0-9a-f]{64}`),
  );
});

test('post-merge behaviour is direct and fail-closed', () => {
  const autoMerge = job('dependabot-auto-merge');
  // The merge flag comes from the merge command's own exit status. The
  // construct this fleet removed asked the API a second time about a merge
  // that had already happened; any failure of that question produced no
  // output, the `if` took the else branch, and the step exited 0 having
  // printed nothing. Measured a no-op in 183 of 183 steps.
  assert.doesNotMatch(autoMerge, /gh pr view/);
  assert.doesNotMatch(autoMerge, /dependabot\/fetch-metadata/);
  assert.match(autoMerge, /set -eu/);
  assert.match(autoMerge, /exit 1/);
  assert.match(autoMerge, /actions: write/);
  // The dispatch names the workflow file THIS lab has.
  assert.match(autoMerge, /gh workflow run deploy\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);
  assert.ok(existsSync(new URL('.github/workflows/deploy.yml', root)));
  // A dispatch whose failure is swallowed is a dispatch that silently stops
  // deploying.
  assert.doesNotMatch(autoMerge, /gh workflow run[^\n]*(?:\|\||continue-on-error)/);
});

test('the dispatch rationale travels with the code it defends', () => {
  // This paragraph is the only thing in that step explaining why the
  // `gh workflow run` line may not be deleted as redundant beside an
  // `on: push` deploy. Deleting the paragraph and deleting the dispatch are
  // the same edit six months apart. The fleet holds one wording; this asserts
  // this lab still carries it.
  for (const line of [
    'A merge made with GITHUB_TOKEN raises no push event -- GitHub suppresses',
    'them so workflows cannot retrigger themselves -- so deploy would never run',
    'and the site would keep serving the previous build. Ask for it explicitly;',
    'a workflow_dispatch through the API is not suppressed. The dispatched run',
    'is the same gate-then-deploy pipeline, so a bad merge still ships nothing.',
  ]) {
    assert.ok(workflow.includes(line), `the dispatch rationale is missing: "${line}"`);
  }
});

test('Dependabot is grouped, with majors left out of the npm group', () => {
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);
  assert.match(dependabot, /npm-minor-and-patch:/);
  assert.match(dependabot, /github-actions:\n\s+patterns:/);
  // Majors individually, on purpose: a breaking major inside a grouped pull
  // request makes the whole thing unmergeable.
  assert.match(dependabot, /update-types:\n\s+- "minor"\n\s+- "patch"/);
  assert.doesNotMatch(dependabot, /- "major"/);
});

test('every job has an explicit timeout', () => {
  // GitHub's default is 360 minutes, which is where a stuck job runs for six
  // hours with nothing red.
  for (const name of ['build', 'browser-gate', 'deploy', 'dependabot-auto-merge']) {
    assert.match(job(name), /timeout-minutes: \d+/);
  }
});

test('a deployment carries and verifies exact source provenance', () => {
  // A green run is not evidence that anything shipped: Pages serves whatever
  // artifact it last accepted. This asks the served bytes.
  assert.match(job('build'), /public\/deployment\.json/);
  assert.match(gitignore, /^public\/deployment\.json$/m);
  assert.match(job('deploy'), /deployment\.json\?sha=\$\{GITHUB_SHA\}/);
  assert.match(job('deploy'), /p\.source_sha===process\.argv\[2\]/);
  assert.match(job('deploy'), /grep -Fq 'id="app"'/);
});

test('the Playwright port is this lab’s own, with strictPort', () => {
  assert.match(playwrightConfig, /--strictPort/);
  // The port the config POLLS and the port the command SERVES must agree. A
  // 2026-09-29 sweep found three labs where a port move updated the URLs and
  // left the command starting the server on the old one: Playwright launched
  // a server on one port, polled another, and failed after its webServer
  // timeout before a single browser test ran.
  const polled = [...playwrightConfig.matchAll(/localhost:(\d{4})/g)].map((m) => m[1]);
  const served = [...playwrightConfig.matchAll(/--port (\d{4})/g)].map((m) => m[1]);
  assert.ok(polled.length > 0 && served.length > 0, 'no ports found in the config');
  const ports = new Set([...polled, ...served]);
  assert.equal(ports.size, 1, 'the polled and served ports disagree');
  // Never the Vite default 4173: a shared port means reuseExistingServer
  // silently scans another lab's preview, and during a mutation check it can
  // scan an unmutated checkout still running from a previous run — which reads
  // as a surviving mutation. Asserted against the port actually IN USE, not
  // against the file's prose, so the comment above it explaining the rule does
  // not trip the rule.
  assert.ok(!ports.has('4173'), 'the Vite default port 4173 must not be used');
  // Build before serve: `vite preview` serves whatever is already in dist/, so
  // without this a failing build leaves the previous bundle in place and the
  // suite passes green against source that no longer compiles.
  assert.match(playwrightConfig, /command: 'npm run build && npm run preview/);
});

test('the test runner actually matches files on disk', () => {
  // A test step that runs zero tests exits 0. The Vitest configs name globs;
  // this asserts the globs match something, so a renamed file cannot turn a
  // CI step into a silent zero-test pass.
  const viteConfig = readFileSync(new URL('vite.config.ts', root), 'utf8');
  const slowConfig = readFileSync(new URL('vitest.slow.config.ts', root), 'utf8');
  assert.match(viteConfig, /include: \['src\/\*\*\/\*\.test\.ts'\]/);
  assert.match(slowConfig, /include: \['src\/\*\*\/\*\.slow\.test\.ts'\]/);
  for (const file of [
    'src/tropical/tropical.test.ts',
    'src/tropical/protocol.test.ts',
    'src/tropical/attacks.test.ts',
    'src/tropical/rates.slow.test.ts',
  ]) {
    assert.ok(existsSync(new URL(file, root)), `${file} is named by a config but absent`);
  }
  // The fast run must EXCLUDE the slow suite, or `npm test` quietly becomes a
  // one-minute command and someone stops running it.
  assert.match(viteConfig, /'src\/\*\*\/\*\.slow\.test\.ts'/);
});

test('user-supplied strings have no innerHTML sink', () => {
  // The by-hand editor takes typed matrices and coefficient lists. Everything
  // this lab renders goes through createTextNode.
  assert.doesNotMatch(dom, /innerHTML/);
});

test('the production build enforces these controls', () => {
  assert.equal(
    packageJson.scripts['test:maintenance'],
    'node --test --test-timeout=60000 tests/maintenance-controls.node.mjs',
  );
  assert.match(packageJson.scripts.build, /npm run test:maintenance/);
  // `node --test` has NO default timeout: --test-timeout defaults to Infinity,
  // so a hung test runs to the job limit with nothing red for six hours. The
  // flag only fires for a test that yields to the macrotask queue -- a
  // synchronous busy-loop is not caught by it -- so timeout-minutes on the job
  // is the backstop that covers every shape. Both are present.
  assert.match(packageJson.scripts['test:maintenance'], /--test-timeout=\d+/);
});

test('the auto-merge path reads the bump type and fails closed', async () => {
  const autoMerge = job('dependabot-auto-merge');
  assert.match(
    autoMerge,
    /\.github\/scripts\/bump-type\.mjs/,
    'the job must read the bump type from the in-repo script',
  );
  assert.match(
    autoMerge,
    /if:\s*steps\.bump\.outputs\.bump\s*==\s*'non-major'/,
    'the merge step must run only for a non-major bump',
  );
  const { bumpType } = await import('../.github/scripts/bump-type.mjs');
  // Fails closed, which is the property that matters: anything it cannot read
  // is 'unknown', and 'unknown' does not merge.
  assert.equal(
    bumpType({ title: 'Bump the npm group across 1 directory', body: 'no versions here' }),
    'unknown',
  );
  assert.equal(bumpType({ title: 'a retitled pull request', body: 'prose only' }), 'unknown');
  assert.equal(
    bumpType({ title: 'Bump x from 1.2.3 to 2.0.0', body: undefined }),
    'unknown',
    'a missing body must not merge',
  );
  // And it still answers the readable cases.
  assert.equal(bumpType({ title: 'Bump vitest from 5.1.0 to 5.2.0', body: 'b' }), 'non-major');
  assert.equal(bumpType({ title: 'Bump vite from 8.3.8 to 9.0.0', body: 'b' }), 'major');
  assert.equal(
    bumpType({ title: 'Bump zod from 0.4.1 to 0.5.0', body: 'b' }),
    'major',
    '0.x minor is breaking',
  );
});

test('the repo ships a licence and ignores what should not be committed', () => {
  const licence = readFileSync(new URL('LICENSE', root), 'utf8');
  assert.match(licence, /MIT License/);
  assert.match(licence, /Copyright \(c\) 2026 Paul Clark/);
  for (const entry of ['node_modules', 'dist', 'test-results', 'playwright-report', 'chat.md']) {
    assert.ok(gitignore.includes(entry), `.gitignore must cover ${entry}`);
  }
  // The master template is read from disk and never committed: a committed
  // copy ages silently into a second, wrong standard.
  assert.match(gitignore, /_MASTER-TEMPLATE\.md/);
});

test('every recorded mutation still applies to the source it names', () => {
  // A mutation whose `find` no longer matches guards nothing, and would let a
  // verdict drift back to a canned value with this control still green. The
  // runner checks this too, but it needs a built tree and a few minutes; this
  // runs on every build.
  const ledger = JSON.parse(readFileSync(new URL('e2e/verdict-mutations.json', root), 'utf8'));
  const entries = Object.entries(ledger.mutations);
  assert.ok(entries.length > 0, 'the ledger records no mutations');
  for (const [id, entry] of entries) {
    const source = readFileSync(new URL(entry.file, root), 'utf8');
    const occurrences = source.split(entry.find).length - 1;
    assert.equal(occurrences, 1, `${id}: its anchor occurs ${occurrences}x in ${entry.file}, expected 1`);
    assert.notEqual(entry.find, entry.replace, `${id}: the patch is a no-op`);
    assert.ok(Object.keys(entry.kills ?? {}).length > 0, `${id}: records no kill`);
    assert.ok(['unit', 'claims'].includes(entry.suite), `${id}: unknown suite ${entry.suite}`);
  }
});

test('the source paper is cited but never vendored', () => {
  // The brief forbids copying the PDF into the repo. This is the control that
  // keeps it true.
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.match(readme, /2015\/852/, 'the README must cite the analysis paper');
  assert.match(readme, /2013\/012/, 'the README must cite the design paper');
  assert.equal(
    existsSync(new URL('eprint-2015-852-kotov-ushakov-tropical-analysis.pdf', root)),
    false,
    'the source PDF must not be committed',
  );
});
