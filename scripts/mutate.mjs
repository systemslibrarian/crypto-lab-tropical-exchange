#!/usr/bin/env node
// Applies, reverts, or JUDGES the recorded §4.1c mutations in
// e2e/verdict-mutations.json.
//
//   node scripts/mutate.mjs list
//   node scripts/mutate.mjs apply <id>
//   node scripts/mutate.mjs revert <id>
//   node scripts/mutate.mjs run [id...]      <- the judging loop
//
// WHY A JUDGING LOOP AND NOT JUST apply/revert
//
// apply/revert leaves the judgement to a person, and the judgement is the part
// that goes wrong. A mutated run can go red for reasons that are not the
// finding: a build error, a server that never started, a port answering from
// an unmutated checkout. Each of those looks exactly like a kill in a terminal
// and is not one. Worse, a patch whose anchor no longer matches applies nothing
// at all, the suite stays green, and "the mutation survived" is
// indistinguishable from "the harness does not bite".
//
// THE FOUR RULES A KILL HAS TO CLEAR, all enforced below:
//
//   1. the owning test PASSED unmutated, in this same run;
//   2. the patch actually CHANGED the file (anchor unique, bytes different,
//      and the reverse patch restores the original md5);
//   3. the run served the MUTATED code -- proved two ways, because one is not
//      enough: the built bundle's hash must move, and the failure must not
//      match a shape that means the code never ran at all;
//   4. the failure is that record's OWN named test, not the suite going red.
//
// The run happens in an isolated `git archive HEAD` tree with node_modules
// symlinked, so nothing is judged against the working copy and a crash cannot
// strand an inverted condition in a file that also holds real work. CI=1 forces
// playwright.config.ts's `reuseExistingServer: !process.env.CI` to false, so
// the lab's port cannot be answered by a server an earlier, unmutated run left
// up -- which is the failure mode that makes a real kill read as a survivor.

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const registry = JSON.parse(readFileSync(join(root, 'e2e', 'verdict-mutations.json'), 'utf8'));
const [command, ...rest] = process.argv.slice(2);

if (command === 'list' || !command) {
  for (const [key, entry] of Object.entries(registry.mutations)) {
    console.log(`${key}\n  ${entry.file}  [${entry.suite}]`);
    for (const [test, note] of Object.entries(entry.kills ?? {})) {
      console.log(`  kills: ${test}\n         ${note}`);
    }
    console.log(`  ${entry.why}\n`);
  }
  process.exit(0);
}

/* ---- apply / revert: one edit, in the working tree ----------------------- */
if (command === 'apply' || command === 'revert') {
  const id = rest[0];
  const entry = registry.mutations[id];
  if (!entry) {
    console.error(`unknown mutation: ${id}`);
    process.exit(2);
  }
  const path = join(root, entry.file);
  const source = readFileSync(path, 'utf8');
  const [from, to] = command === 'apply' ? [entry.find, entry.replace] : [entry.replace, entry.find];
  const occurrences = source.split(from).length - 1;
  if (occurrences !== 1) {
    console.error(`refusing: ${entry.file} matched ${occurrences}x, want exactly 1`);
    process.exit(2);
  }
  writeFileSync(path, source.replace(from, to));
  console.log(`${command} ${id} -> ${entry.file}`);
  process.exit(0);
}

if (command !== 'run') {
  console.error(`unknown command: ${command}. Try list, apply, revert or run.`);
  process.exit(2);
}

/* ---- run: the judging loop ---------------------------------------------- */

const ids = rest.length ? rest : Object.keys(registry.mutations);
const unknown = ids.filter((id) => !registry.mutations[id]);
if (unknown.length) {
  console.error(`unknown mutation(s): ${unknown.join(', ')}`);
  process.exit(2);
}

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();

// `git archive HEAD` cannot see uncommitted work, so a dirty tree would produce
// results about a tree nobody has.
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty && !process.env.MUTATION_ALLOW_DIRTY) {
  console.error('Refusing to run: uncommitted changes to tracked files.\n');
  console.error(dirty);
  console.error('\nThe isolated tree is archived from HEAD and would not contain them.');
  console.error('Commit first. MUTATION_ALLOW_DIRTY=1 overrides, knowing that.');
  process.exit(2);
}
const sha = git('rev-parse', 'HEAD').slice(0, 7);

/* Rule 2, checked for every selected patch BEFORE any is applied. An
   unreversible patch strands a mutated file and turns every later result into
   a verdict about that file rather than about its own mutation. */
const invalid = [];
for (const id of ids) {
  const entry = registry.mutations[id];
  const text = readFileSync(join(root, entry.file), 'utf8');
  const anchors = text.split(entry.find).length - 1;
  if (anchors !== 1) {
    invalid.push(`${id}: find occurs ${anchors} times in ${entry.file}, expected 1`);
    continue;
  }
  const after = text.replace(entry.find, entry.replace);
  if (after === text) {
    invalid.push(`${id}: the patch is a no-op, it would not change ${entry.file}`);
  } else if (after.split(entry.replace).length - 1 !== 1) {
    invalid.push(`${id}: replace occurs more than once after applying, so it cannot be reverted`);
  }
  if (!Object.keys(entry.kills ?? {}).length) {
    invalid.push(`${id}: records no kill, so it covers nothing`);
  }
}
if (invalid.length) {
  console.error('Refusing to run: these patches cannot make the round trip.\n');
  for (const line of invalid) console.error(`  ${line}`);
  process.exit(2);
}

const TREE = mkdtempSync(join(tmpdir(), 'tropical-mutation-'));
console.log(`isolated tree: ${TREE}`);
console.log(`archived from: ${sha}`);
console.log(`${ids.length} patches make the round trip.\n`);
execSync(`git -C ${root} archive HEAD | tar -x -C ${TREE}`, { stdio: 'pipe' });
symlinkSync(join(root, 'node_modules'), join(TREE, 'node_modules'));

const sh = (cmd) =>
  execSync(cmd, {
    cwd: TREE,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 128 * 1024 * 1024,
  });

const DIST = join(TREE, 'dist', 'assets');
function bundleHash() {
  if (!existsSync(DIST)) return null;
  const h = createHash('sha256');
  for (const f of readdirSync(DIST).sort()) h.update(f).update(readFileSync(join(DIST, f)));
  return h.digest('hex').slice(0, 12);
}
const md5 = (rel) => createHash('md5').update(readFileSync(join(TREE, rel))).digest('hex').slice(0, 12);

function build() {
  try {
    sh('npx vite build');
    return true;
  } catch {
    return false;
  }
}

/** The typecheck is a separate question from whether the bundle builds. */
function typechecks() {
  try {
    sh('npx tsc --noEmit');
    return true;
  } catch {
    return false;
  }
}

const strip = (s) => s.replace(/\[[0-9;]*m/g, '');

/** Rule 3's second half. Red for one of these reasons means the code never ran. */
const NOT_A_KILL = [
  { pattern: /error TS\d+|Build failed|Transform failed|Could not resolve/i, label: 'build error' },
  {
    pattern: /webServer.*(?:did not start|was not able to start)|Timed out waiting .* from config\.webServer/i,
    label: 'server never started',
  },
  { pattern: /net::ERR_CONNECTION_REFUSED|EADDRINUSE/i, label: 'nothing served on the port' },
];
const notAKill = (output) => NOT_A_KILL.find(({ pattern }) => pattern.test(strip(output)))?.label ?? null;

/**
 * The WHOLE suite, never a single filtered test.
 *
 * Filtering to the owning test would answer a different question: it cannot
 * show that the mutation leaves everything else alone, and it cannot show that
 * the baseline passed. Both suites run whole, once per phase, and the per-test
 * answer is read out of the reporter.
 */
function runSuite(suite) {
  const cmd =
    suite === 'claims'
      ? 'npx playwright test --project=claims --reporter=json --retries=0'
      : 'npx vitest run --reporter=json';
  try {
    return { failed: false, output: sh(cmd) };
  } catch (err) {
    return { failed: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Test titles that FAILED, from either reporter's JSON. */
function failingTitles(suite, output) {
  const json = extractJson(output);
  if (!json) return null;
  const titles = [];
  if (suite === 'claims') {
    const walk = (node) => {
      for (const spec of node.specs ?? []) {
        if (!spec.ok) titles.push(spec.title);
      }
      for (const child of node.suites ?? []) walk(child);
    };
    walk(json);
  } else {
    for (const file of json.testResults ?? []) {
      for (const assertion of file.assertionResults ?? []) {
        if (assertion.status === 'failed') titles.push(assertion.title ?? assertion.fullName);
      }
    }
  }
  return titles;
}

/** Test titles that PASSED, for rule 1. */
function passingTitles(suite, output) {
  const json = extractJson(output);
  if (!json) return null;
  const titles = [];
  if (suite === 'claims') {
    const walk = (node) => {
      for (const spec of node.specs ?? []) {
        if (spec.ok) titles.push(spec.title);
      }
      for (const child of node.suites ?? []) walk(child);
    };
    walk(json);
  } else {
    for (const file of json.testResults ?? []) {
      for (const assertion of file.assertionResults ?? []) {
        if (assertion.status === 'passed') titles.push(assertion.title ?? assertion.fullName);
      }
    }
  }
  return titles;
}

/** Both runners print prose around their JSON; take the outermost object. */
function extractJson(output) {
  const text = strip(output);
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* keep walking back to the previous closing brace */
    }
  }
  return null;
}

function apply(entry, forward) {
  const [from, to] = forward ? [entry.find, entry.replace] : [entry.replace, entry.find];
  const path = join(TREE, entry.file);
  const before = readFileSync(path, 'utf8');
  if (before.split(from).length - 1 !== 1) throw new Error(`${entry.file}: anchor no longer unique`);
  const after = before.replace(from, to);
  if (after === before) throw new Error('the patch produced an identical file: it did not apply');
  writeFileSync(path, after);
}

console.log('building the baseline in the isolated tree...');
if (!build()) {
  console.error('The baseline build fails in the isolated tree. Nothing below would mean anything.');
  rmSync(TREE, { recursive: true, force: true });
  process.exit(2);
}
const baselineHash = bundleHash();
console.log(`baseline bundle ${baselineHash}`);

// Rule 1's denominator: the baseline result for every suite a mutation names.
const suites = [...new Set(ids.map((id) => registry.mutations[id].suite))];
const baselinePassing = {};
for (const suite of suites) {
  process.stdout.write(`running the unmutated ${suite} baseline... `);
  const baseline = runSuite(suite);
  if (baseline.failed) {
    console.error('\nThe unmutated suite does not pass in the isolated tree. Nothing below would');
    console.error('mean anything: a mutation "caught" by an already-red suite is caught by nothing.\n');
    console.error(strip(baseline.output).split('\n').slice(-25).join('\n'));
    rmSync(TREE, { recursive: true, force: true });
    process.exit(2);
  }
  const passed = passingTitles(suite, baseline.output);
  if (!passed) {
    console.error(`\nCould not read the ${suite} reporter's output. Refusing to judge blind.`);
    rmSync(TREE, { recursive: true, force: true });
    process.exit(2);
  }
  baselinePassing[suite] = new Set(passed);
  console.log(`PASSED (${passed.length} tests)`);
}
console.log();

const results = [];
for (const id of ids) {
  const entry = registry.mutations[id];
  const named = Object.keys(entry.kills ?? {});
  process.stdout.write(`${id.padEnd(38)} `);
  try {
    // Rule 1: every test this record names must have passed unmutated.
    const notInBaseline = named.filter((t) => !baselinePassing[entry.suite].has(t));
    if (notInBaseline.length) {
      console.log(`NAMED TEST NOT IN BASELINE (${notInBaseline.join(', ')})`);
      results.push({ id, verdict: 'NAMED TEST NOT IN BASELINE', named });
      continue;
    }

    const beforeMd5 = md5(entry.file);
    apply(entry, true);
    const compiles = typechecks();
    const built = build();
    const mutatedHash = built ? bundleHash() : null;
    const mutated = built ? runSuite(entry.suite) : { failed: false, output: '' };
    const failed = built ? failingTitles(entry.suite, mutated.output) : [];
    apply(entry, false);
    build();
    const restoredHash = bundleHash();
    if (md5(entry.file) !== beforeMd5) {
      console.log('NOT RESTORED');
      console.error(`\n${id}: ${entry.file} did not return to md5 ${beforeMd5}. Aborting.`);
      rmSync(TREE, { recursive: true, force: true });
      process.exit(2);
    }

    const shape = built ? notAKill(mutated.output) : null;
    const survived = failed === null ? named : named.filter((t) => !failed.includes(t));

    const verdict = !compiles
      ? 'DOES NOT TYPECHECK'
      : !built
        ? 'DOES NOT BUILD'
        : mutatedHash === baselineHash
          ? 'BUNDLE UNCHANGED'
          : shape
            ? `NOT A KILL (${shape})`
            : failed === null
              ? 'REPORTER UNREADABLE'
              : survived.length
                ? `SURVIVED (${survived.join('; ')})`
                : restoredHash !== baselineHash
                  ? 'NOT RESTORED'
                  : 'KILLED';
    results.push({ id, verdict, named });
    console.log(
      verdict === 'KILLED'
        ? `KILLED  ${baselineHash} -> ${mutatedHash} -> ${restoredHash}  by: ${named.join('; ')}`
        : verdict,
    );
  } catch (err) {
    console.log(`ERROR  ${err.message}`);
    console.error('\nAborting: a mutated file left in place makes every later verdict a statement about it.');
    rmSync(TREE, { recursive: true, force: true });
    process.exit(2);
  }
}

rmSync(TREE, { recursive: true, force: true });
const bad = results.filter((r) => r.verdict !== 'KILLED');
const covered = results.reduce((n, r) => n + r.named.length, 0);
console.log(
  `\n${results.length - bad.length}/${results.length} mutations killed, covering ${covered} named assertions.`,
);
if (bad.length) {
  console.log('\nNot killed:');
  for (const r of bad) console.log(`  ${r.id}: ${r.verdict}`);
  console.log('\nDOES NOT BUILD / DOES NOT TYPECHECK is a broken PATCH, not a surviving mutation:');
  console.log('fix the patch and re-run. SURVIVED is evidence about the SOURCE or the test, and is');
  console.log('the one worth stopping for.');
}
process.exit(bad.length ? 1 : 0);
