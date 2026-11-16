import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditControlNames, formatControlNameFailures } from './control-names';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, and each one corrects something the
 * retired template gate did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important` through `addStyleTag`, which BYPASSES this
 *     lab's own `@media (prefers-reduced-motion: reduce)` block instead of
 *     exercising it — so the rendering a reduced-motion reader actually gets
 *     was never the rendering that got scanned. This gate sets the preference
 *     through `emulateMedia`, asserts from inside the page that it took
 *     effect (`test.use({ reducedMotion })` is a measured no-op on Playwright
 *     1.6x), and injects nothing.
 *
 *  2. IT FORCED EVERY PANEL VISIBLE FROM SCRIPT. Stripping `[hidden]` puts all
 *     six tabpanels on screen at once — a rendering no reader can reach — and
 *     script-opening every `<details>` means the SHUT state, which is what
 *     every reader arrives at, was never scanned. This gate clicks the real
 *     tabs and opens each disclosure through its `<summary>`, and scans before
 *     and after.
 *
 *  3. IT DROVE BLIND AND THREW THE STATES AWAY. The old drive clicked by label
 *     regex, swallowed failures with `.catch(() => {})`, waited a fixed 400ms
 *     and scanned ONCE at the end. This drive names every control it touches,
 *     asserts a real completion signal after each, and scans after every step.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Every surface carrying
 *     this lab's meaning — all four verdict tones, both pill states, the
 *     callouts, the learner-check tint, and the three highlighted matrix-cell
 *     classes — is a `color-mix()` fill that axe files under `incomplete`
 *     rather than judging. So is an `aria-label` on a role-less element.
 *
 *  5. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. That
 *     matters more here than in most labs: this page renders ten-by-ten tables
 *     of twelve-digit integers, which is precisely the shape that pushes a
 *     document sideways at phone width. `expectNoHorizontalOverflow` is the
 *     check that says the `.table-wrap` scroll regions are doing their job.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough: a transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will report it. Transitions drain in
 * waves, so a poll for "nothing running right now" can exit through a gap
 * between waves — hence six consecutive quiet frames.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * infinite animations are excluded rather than waited on, a wall-clock budget
 * inside the page gives up and proceeds, and Playwright's timeout is the
 * backstop.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' },
  );
}

/**
 * Assert that reduced motion left the page VISIBLE, not merely un-animated.
 *
 * The failure this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring the end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab
 * has exactly that shape in miniature: `@keyframes fade` starts at `opacity: 0`
 * and every tabpanel rides it. The reduced-motion block cancels it with
 * `animation: none`, which restores the static `opacity: 1` — correct today,
 * and this assertion is what makes that a measurement rather than a reading.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from page creation.
 *
 * Every panel here renders synchronously at first activation, so a renderer
 * that throws leaves that tabpanel EMPTY — and an empty region is exactly what
 * a scan reports as perfectly accessible. Attach before `boot`, assert after
 * the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's hero
 * is a `<div class="cl-hero">`, not a `<header>`, so nothing here implies a
 * second banner today — but the shared bar ships `dedupeBanner()` because
 * other labs DID ship one, and the hero is the part of this page most likely
 * to be re-templated from a lab that uses `<header>`. Asserting the OUTCOME
 * rather than the markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false;
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * Any explicit role on a `ul`/`ol` must be `list` — any other value orphans
 * every `<li>` under it — and a `role="list"` must never sit on an empty
 * element, because axe applies `aria-required-children` to the explicit role
 * and fails it the day that list renders with no items. This lab builds its
 * lists from script (`h('ul', { role: 'list' }, …)`), and an empty one is
 * exactly what an attack returning no cover would produce, so this is a live
 * risk rather than a formality. Ask the DOM rather than grepping the source.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`,
      ),
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children',
  ).toEqual([]);
}

/**
 * Load the page with reduced motion actually in effect, and assert the content
 * every scan relies on is really there — including the lab's DEFAULTS.
 *
 * THIS FUNCTION ASSERTS STRUCTURE AND NEVER PRODUCT COPY (§4.1a). It runs
 * before every test that imports it, so an assertion here fails all of them at
 * once, under whatever name those tests carry. On 2026-09-26 a sibling lab
 * changed one default string in the same commit that corrected its security
 * claims; its `gate.ts` still asserted the old sentence, both axe runs failed,
 * the deploy was skipped, and the step that went red was called "Accessibility
 * gate". For three days the live site served claims that `main` had already
 * corrected, and the one red thing in sight named the wrong subject.
 *
 * So: the control EXISTS, the arrival panel is the one that ships, counts,
 * `[hidden]`/`toBeEmpty()` on lazily-rendered panels, a default matching a
 * SHAPE. What a string SAYS belongs in `e2e/claims.spec.ts`, where a failure
 * names copy as the subject.
 */
export async function boot(page: Page): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect',
  ).toBe(true);

  // Dark is the only theme, pinned with a literal before first paint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.tab-btn')).toHaveCount(6);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly what a green axe run says nothing
  // about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page carries no theme control at all. The
  // shared CSS hides any lab toggle with `display:none !important`, which
  // would leave a dead-but-known element; asserting the count at zero catches
  // the day one is added without going through that list.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]'),
  ).toHaveCount(0);

  // ── The arrival state: Min-Plus Arithmetic active, five panels unrendered ─
  await expect(page.locator('#panel-algebra')).toBeVisible();
  await expect(page.locator('#panel-algebra')).not.toBeEmpty();
  for (const id of ['exchange', 'heuristic', 'limits', 'general', 'trials']) {
    await expect(page.locator(`#panel-${id}`)).toBeHidden();
    // EMPTY, not merely hidden: this lab renders each panel on first
    // activation, and "empty" is the tell that a renderer threw.
    await expect(page.locator(`#panel-${id}`)).toBeEmpty();
  }

  // ── Shipped defaults, as SHAPES ─────────────────────────────────────────
  // Four cell buttons on the arithmetic panel, exactly one of them pressed.
  await expect(page.locator('#panel-algebra .cell-btn')).toHaveCount(4);
  await expect(page.locator('#panel-algebra .cell-btn[aria-pressed="true"]')).toHaveCount(1);
  // A rendered measurement is present. WHAT it says is a claim, asserted in
  // claims.spec.ts.
  await expect(page.locator('#panel-algebra [data-claim]').first()).toBeVisible();

  // ── Disclosures ship shut ───────────────────────────────────────────────
  await expect(page.locator('#panel-algebra details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, 'first paint');
}

/**
 * Assert the page does not require horizontal scrolling (WCAG 1.4.10).
 *
 * axe has no rule for this at all, and this lab is the shape that fails it:
 * ten-column tables of twelve-digit integers. They are supposed to scroll
 * inside their own `.table-wrap` region rather than push the document, and
 * this is the check that says they do.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide table inside an `overflow: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing — naming it sends
    // you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This is NOT vacuous here, unlike in most labs: every matrix on this page
 * sits in a live `.table-wrap` scroller. `matrixTable` gives each one
 * `tabindex="0"`, a `role="region"` and an `aria-label` — and this is the
 * check that proves it, at every driven state, rather than trusting one
 * helper's source. A scroller born without a keyboard route is invisible to
 * axe, and the Linux CI runner is where it usually surfaces.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`,
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`,
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen.
 * `display: none` and `visibility: hidden` DO remove an element from the tab
 * order, so those are skipped rather than flagged.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with
 * full opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`,
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect. The collection pass turns that into a single run. It is a debugging
 * aid only: `A11Y_COLLECT` is never set in CI, and a run with it set prints
 * every finding and then FAILS at the end, so a green collection run cannot be
 * mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/** Fail the test if the collection pass recorded anything. */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately. Fleet-wide this oracle had been
 * called from inside a soft wrapper AFTER its `if (!COLLECTING) return` guard
 * — so in a strict run, which is every run in CI, the guard returned first and
 * the oracle never executed at all. Thirteen repos certified themselves clean
 * on an oracle that had never looked.
 *
 * It ratchets: anything NOT in the baseline fails, anything in the baseline
 * that got WORSE fails, and anything in the baseline that has been FIXED fails
 * until its entry is deleted. That last rule is what stops the allowlist
 * becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — delete the entry, which is the point — or the
 * drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)',
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. Only `color-contrast` is allowed to remain there, and
 *    only because the next assertion computes those ratios arithmetically.
 *    Everything else in that bucket is a real result axe could not finish —
 *    including `aria-prohibited-attr`, where an `aria-label` on a role-less
 *    element hides. This page leans on getting that right: the preset row, the
 *    trial-count row, the cell picker and every learner-check option group
 *    pair their labels with `role="group"`, and the matrix scroll regions
 *    carry `role="region"` with a label. Drop any of those roles and the label
 *    is silently discarded.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1, live here.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);

  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `withTags()` and `withRules()` both write `options.runOnly`, so the second
  // call SILENTLY REPLACES the first. Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding an `<aside class="cl-hero-why">`, two `<nav>`s,
  // one `<main>` and a footer.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // axe's `label` rule accepts a bare `placeholder` as an accessible name, so a
  // deleted label can leave this gate green. See `control-names.ts`.
  const unnamed = formatControlNameFailures(await auditControlNames(page));
  softExpect(unnamed, `form controls named only by placeholder/title in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the
  // ONLY thing that ever measures it.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true),
      ),
    ),
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Switch to a tab by clicking it, and prove the switch happened. */
async function openTab(page: Page, name: RegExp, panelId: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(panelId)).toBeVisible();
  await expect(page.locator(panelId)).not.toBeEmpty();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Five things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it.
 *
 *  - EVERY PANEL RENDERS LAZILY, so a tab never clicked is a panel never in
 *    the DOM. Each of the six is activated through its real tab button.
 *
 *  - EVERY REFUSAL STATE. The by-hand editor's commuting-pair refusal and its
 *    non-integer refusal are reachable only by typing something wrong on
 *    purpose, and both repaint a control with `aria-invalid` and render a
 *    failure verdict. Neither had ever been scanned in a lab of this shape.
 *
 *  - HOVER IS A STATE, AND IT PERSISTS AFTER A CLICK. `:hover` stays on the
 *    element under the pointer after `click()` resolves, and both `.tab-btn`
 *    and `.cl-btn` repaint their fill on it.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM completion signal.
 */
export async function driveAllStates(page: Page, label: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${label} / ${s}`);

  await scanAt('arrival: Min-Plus Arithmetic active, five panels unrendered, disclosures shut');

  // ── The shared skip link, focused ───────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── Exhibit 1: Min-Plus Arithmetic ──────────────────────────────────────
  const lastCell = page.locator('#panel-algebra .cell-btn').last();
  await lastCell.click();
  await expect(lastCell).toHaveAttribute('aria-pressed', 'true');
  await scanAt('Arithmetic: a different product cell traced, with its minimising term marked');

  await page.locator('#panel-algebra details.learner-check > summary').click();
  await expect(page.locator('#panel-algebra details[open]')).toHaveCount(1);
  await scanAt('Arithmetic: the quick check opened');

  // Scoped to the check's own feedback region: this panel ALSO renders a
  // `.pill-ok` on the minimising term of its product trace, so an unscoped
  // locator here is ambiguous rather than wrong.
  await page.locator('#panel-algebra .check-opt').nth(1).click();
  await expect(page.locator('#panel-algebra .check-feedback .pill-bad')).toBeVisible();
  await scanAt('Arithmetic: quick check answered wrong — the Not quite pill');

  await page.locator('#panel-algebra .check-opt').first().click();
  await expect(page.locator('#panel-algebra .check-feedback .pill-ok')).toBeVisible();
  await scanAt('Arithmetic: quick check answered right — the Correct pill');

  // ── Exhibit 2: The Exchange ─────────────────────────────────────────────
  await openTab(page, /The Exchange/, '#panel-exchange');
  await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toBeVisible();
  await scanAt('Exchange: the worked 3x3 instance, both keys computed and compared');

  // The by-hand editor, opened the way a reader opens it.
  await page.locator('#by-hand-editor > summary').click();
  await expect(page.locator('#by-hand-editor[open]')).toHaveCount(1);
  await scanAt('Exchange: the by-hand editor open on its default instance');

  // A REFUSAL: set B equal to A, so the pair commutes.
  const aValue = await page.locator('#edit-a').inputValue();
  await page.locator('#edit-b').fill(aValue);
  await page.locator('#apply-by-hand').click();
  await expect(page.locator('[data-verdict="by-hand-refused"]')).toBeVisible();
  await scanAt('Exchange: a commuting pair refused — the failure verdict and its reason');

  // A SECOND REFUSAL: a non-integer coefficient.
  await page.locator('#edit-b').fill('[[57, -23, 10], [-64, 3, -91], [38, -70, -12]]');
  await page.locator('#edit-p1').fill('4, -7, 2.5');
  await page.locator('#apply-by-hand').click();
  await expect(page.locator('[data-verdict="by-hand-refused"]')).toBeVisible();
  await scanAt('Exchange: a non-integer coefficient refused');

  // Back to a working instance, then the all-positive one.
  await page.locator('#edit-p1').fill('4, -7, 2');
  await page.locator('#load-instance-c').click();
  await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toBeVisible();
  await scanAt('Exchange: the all-positive instance loaded and agreeing');

  // A larger preset: a ten-by-ten matrix of twelve-digit entries, which is the
  // reflow and scroll-region case this lab exists to get right.
  await page.getByRole('button', { name: "Designers' parameters" }).click();
  await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toBeVisible();
  await scanAt('Exchange: the designers 10x10 preset — wide tables in scroll regions');

  await page.getByRole('button', { name: 'Generate a fresh instance' }).click();
  await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toBeVisible();
  await scanAt('Exchange: a freshly generated 10x10 instance, still hovered after the click');

  // ── Exhibit 3: The Heuristic Attack ─────────────────────────────────────
  await openTab(page, /The Heuristic Attack/, '#panel-heuristic');
  await expect(page.locator('#panel-heuristic [data-verdict="heuristic-outcome"]')).toBeVisible();
  await scanAt('Heuristic: the scan on the designers preset at its landing pair');

  await page.locator('#scan-next').click();
  await expect(page.locator('#panel-heuristic [data-verdict="scan-step"]')).toBeVisible();
  await scanAt('Heuristic: stepped to the next pair — a non-constant difference matrix');

  await page.locator('#scan-prev').click();
  await expect(page.locator('#panel-heuristic [data-verdict="scan-step"]')).toBeVisible();
  await scanAt('Heuristic: stepped back');

  // A scan cell clicked directly.
  await page.locator('#panel-heuristic .scan-cell').first().click();
  await expect(page.locator('#panel-heuristic [data-verdict="scan-step"]')).toBeVisible();
  await scanAt('Heuristic: a scan cell selected directly from the grid');

  // The wrong-message fixture, opened through its summary.
  await page.locator('#mismatch-fixture > summary').click();
  await expect(page.locator('#mismatch-fixture[open]')).toHaveCount(1);
  await expect(page.locator('[data-verdict="mismatch-outcome"]')).toBeVisible();
  await scanAt('Heuristic: the wrong-message fixture — a well-formed key that is not the key');

  await page.locator('#panel-heuristic details.learner-check > summary').click();
  await page.locator('#panel-heuristic .check-opt').first().click();
  await expect(page.locator('#panel-heuristic .check-feedback .pill-ok')).toBeVisible();
  await scanAt('Heuristic: quick check answered');

  // ── Exhibit 4: Where It Stops Working ───────────────────────────────────
  await openTab(page, /Where It Stops Working/, '#panel-limits');
  await expect(page.locator('#panel-limits [data-verdict="limits-outcome"]')).toBeVisible();
  await expect(page.locator('#panel-limits [data-verdict="limits-general-outcome"]')).toBeVisible();
  await scanAt('Limits: the scan finding nothing on non-negative parameters');

  await page.locator('#panel-limits details.learner-check > summary').click();
  await page.locator('#panel-limits .check-opt').nth(1).click();
  await expect(page.locator('#panel-limits .check-feedback .pill-bad')).toBeVisible();
  await scanAt('Limits: quick check answered wrong');

  // ── Exhibit 5: The General Attack ───────────────────────────────────────
  await openTab(page, /The General Attack/, '#panel-general');
  await expect(page.locator('#panel-general [data-verdict="general-outcome"]')).toBeVisible();
  await scanAt('General: the cover, the solved coefficients and the recovered key');

  await page.locator('#panel-general details.disclosure > summary').first().click();
  await expect(page.locator('#panel-general details.disclosure[open]')).toHaveCount(1);
  await scanAt('General: the solver explainer opened');

  await page.locator('#panel-general details.learner-check > summary').click();
  await page.locator('#panel-general .check-opt').first().click();
  await expect(page.locator('#panel-general .check-feedback .pill-ok')).toBeVisible();
  await scanAt('General: quick check answered');

  // ── Exhibit 6: Many Trials ──────────────────────────────────────────────
  await openTab(page, /Many Trials/, '#panel-trials');
  await expect(page.locator('#panel-trials [data-verdict="trials-outcome"]')).toBeVisible();
  await scanAt('Trials: the arrival state, nothing run yet');

  // A real run, at the smallest N so the gate does not spend a minute here.
  // The Stop button is disabled in this state and enabled during the run, so
  // both renderings of a disabled control get scanned.
  await page.locator('#run-trials').click();
  await expect(page.locator('#panel-trials .rate-row').first()).toBeVisible({ timeout: 60_000 });
  await scanAt('Trials: a run in flight — bars, reference markers and the counts table');

  await expect(page.locator('#run-trials')).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('#panel-trials .rate-row')).toHaveCount(3);
  await scanAt('Trials: the completed run, three parameter sets measured against the paper');

  // ── Hover, which persists after a click ─────────────────────────────────
  await page.getByRole('tab', { name: /The Exchange/ }).hover();
  await scanAt('an inactive tab hovered — its surface-2 fill repainted');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings on the controls that take them ──────────────────────────
  await page.locator('#run-trials').focus();
  await expect(page.locator('#run-trials')).toBeFocused();
  await scanAt('a primary button focused, showing its focus-visible outline');

  await page.getByRole('tab', { name: /Many Trials/ }).focus();
  await scanAt('the active tab focused');

  // A matrix scroll region focused: this lab's one genuinely scrollable
  // element class, and the state that proves the keyboard route exists.
  await openTab(page, /The Exchange/, '#panel-exchange');
  await page.locator('#panel-exchange .table-wrap').first().focus();
  await expect(page.locator('#panel-exchange .table-wrap').first()).toBeFocused();
  await scanAt('a matrix scroll region focused — the keyboard route into a scroller');
}
