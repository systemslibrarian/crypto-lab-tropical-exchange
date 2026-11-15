import { expect, test, type Locator, type Page } from '@playwright/test';
import { boot } from './gate';

/**
 * The claims suite: what this lab's interface SAYS, as opposed to what it is
 * shaped like. §4.1b of the master template.
 *
 * These assertions deliberately do NOT live in `boot()`. A copy assertion in
 * the shared setup fails every test that imports it at once, under the name
 * "Accessibility gate" — a report naming the wrong subject. A sibling lab lost
 * three days of corrected security claims to exactly that. Here, a failure
 * says "claims", which is what actually changed.
 *
 * ── The rule that makes these worth anything ──
 * Compare two values the page itself printed, or RE-DERIVE a claim from the
 * page's raw inputs by a different route than the source takes. A test that
 * recomputes the same expression the source uses will happily agree with a
 * bug — that has happened in this fleet, where a fix was "verified" by a test
 * that recomputed the identical faulty branch.
 *
 * But internal consistency is not enough either: a page can be consistently
 * wrong. So the independent re-derivations below carry their own few lines of
 * min-plus arithmetic, written from the definition rather than imported from
 * `src/`, and read their inputs out of the rendered tables.
 */

/** Read a rendered matrix back out of its table. The page's own output. */
async function readMatrix(scope: Locator): Promise<number[][]> {
  return scope.evaluate((figure: HTMLElement) => {
    const rows = Array.from(figure.querySelectorAll('tbody tr'));
    return rows.map((row) =>
      Array.from(row.querySelectorAll('td .cell-value')).map((cell) => {
        const text = (cell.textContent ?? '').trim();
        return text === '∞' ? Infinity : Number(text);
      }),
    );
  });
}

/** The matrix figure whose caption starts with `caption`. */
function figureByCaption(page: Page, panel: string, caption: string | RegExp): Locator {
  return page.locator(`${panel} .matrix-figure`).filter({
    has: page.locator('figcaption', { hasText: caption }),
  });
}

/**
 * Min-plus arithmetic, written here from the definition.
 *
 * Deliberately NOT imported from `src/tropical/tropical.ts`: importing the
 * implementation would make every check below a tautology, agreeing with the
 * source however wrong it is. These four lines are the independent route.
 */
const mul = (x: number[][], y: number[][]): number[][] =>
  x.map((row) => y[0].map((_, j) => Math.min(...row.map((v, k) => v + y[k][j]))));
const scalar = (c: number, x: number[][]): number[][] => x.map((row) => row.map((v) => v + c));
const pow = (a: number[][], k: number): number[][] => {
  let out = a.map((row, i) => row.map((_, j) => (i === j ? 0 : Infinity)));
  for (let n = 0; n < k; n++) out = mul(out, a);
  return out;
};

test.describe('displayed claims', () => {
  test('the hero names the scheme and its subtitle carries the spec', async ({ page }) => {
    await boot(page);
    await expect(page.locator('h1.cl-hero-title')).toHaveText('Tropical Exchange');
    await expect(page.locator('.cl-hero-sub')).toHaveText(
      'Min-plus matrices · Stickel-style key exchange · broken twice',
    );
  });

  test('the arithmetic panel’s traced cell equals a minimum computed here', async ({ page }) => {
    await boot(page);
    // The page prints X and Y, and claims a value for one cell of X ⊗ Y. Read
    // both matrices off the page and recompute that cell independently.
    const x = await readMatrix(figureByCaption(page, '#panel-algebra', 'X').first());
    const y = await readMatrix(figureByCaption(page, '#panel-algebra', 'Y').first());
    const claimed = await page
      .locator('#panel-algebra [data-claim="algebra-cell-00"]')
      .getAttribute('data-value');
    const expected = Math.min(...x[0].map((v, k) => v + y[k][0]));
    expect(Number(claimed)).toBe(expected);
    // And the rendered text agrees with the machine value beside it.
    await expect(page.locator('#panel-algebra [data-claim="algebra-cell-00"]')).toHaveText(
      String(expected),
    );
  });

  test('both parties’ keys on screen are equal, compared cell by cell here', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    const alice = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));
    const bob = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Bob/));
    expect(alice.length).toBeGreaterThan(0);
    expect(alice).toEqual(bob);
    // The verdict agrees with the comparison this test just made.
    await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toHaveAttribute(
      'data-result',
      'pass',
    );
    await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toContainText(
      'KEYS AGREE',
    );
  });

  test('the count of compared entries matches the matrix the page drew', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    const alice = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));
    const claimed = await page
      .locator('#panel-exchange [data-claim="key-cells-compared"]')
      .getAttribute('data-value');
    // A cross-check: the counter against the cells it counts.
    expect(Number(claimed)).toBe(alice.length * alice[0].length);
  });

  test('the largest key entry claim matches the largest entry on screen', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    const alice = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));
    const claimed = await page
      .locator('#panel-exchange [data-claim="key-max-entry"]')
      .getAttribute('data-value');
    const largest = Math.max(...alice.flat().map((v) => Math.abs(v)));
    expect(Number(claimed)).toBe(largest);
  });

  test('the heuristic’s (i, j, c) reproduces U when recomputed here', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    const a = await readMatrix(figureByCaption(page, '#panel-exchange', 'A').first());
    const b = await readMatrix(figureByCaption(page, '#panel-exchange', 'B').first());
    const u = await readMatrix(figureByCaption(page, '#panel-exchange', /^U =/));

    await page.getByRole('tab', { name: 'The Heuristic Attack' }).click();
    const i = Number(await page.locator('[data-claim="heuristic-i"]').getAttribute('data-value'));
    const j = Number(await page.locator('[data-claim="heuristic-j"]').getAttribute('data-value'));
    const c = Number(await page.locator('[data-claim="heuristic-c"]').getAttribute('data-value'));

    // THE HEADLINE CLAIM, re-derived from the page's own A, B and U by this
    // file's own min-plus arithmetic: c ⊗ A^⊗i ⊗ B^⊗j must BE U.
    expect(scalar(c, mul(pow(a, i), pow(b, j)))).toEqual(u);
  });

  test('the recovered key on screen equals the honest key on screen', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Heuristic Attack' }).click();
    const recovered = await readMatrix(
      figureByCaption(page, '#panel-heuristic', /what the eavesdropper computed/),
    );
    const honest = await readMatrix(
      figureByCaption(page, '#panel-heuristic', /The key Alice and Bob actually share/),
    );
    expect(recovered.length).toBeGreaterThan(0);
    expect(recovered).toEqual(honest);
    await expect(page.locator('[data-verdict="heuristic-outcome"]')).toHaveAttribute(
      'data-result',
      'alarm',
    );
  });

  test('the scan step’s matching-cell count matches the cells it marked', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Heuristic Attack' }).click();
    const claimed = await page
      .locator('[data-claim="scan-matching-cells"]')
      .getAttribute('data-value');
    const marked = await page.locator('#panel-heuristic .step-out td.cell-match').count();
    const total = await page.locator('#panel-heuristic .step-out td.matrix-cell').count();
    // A cross-check between a counter and the marks it counts.
    expect(claimed).toBe(`${marked}/${total}`);
  });

  test('the general attack’s cover reaches every cell it claims to', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The General Attack' }).click();
    const coverSize = Number(
      await page.locator('[data-claim="general-cover-size"]').getAttribute('data-value'),
    );
    const listed = await page.locator('#panel-general .cover-item').count();
    expect(listed).toBe(coverSize);
    // Parts sum to whole: every cell of the grid must carry a cover index, or
    // the product would sit strictly above U somewhere.
    const covered = await page.locator('#panel-general td.cell-cover').count();
    const total = await page
      .locator('#panel-general .matrix-figure')
      .filter({ has: page.locator('figcaption', { hasText: /Which chosen term/ }) })
      .locator('td.matrix-cell')
      .count();
    expect(covered).toBe(total);
  });

  test('the general attack’s X and Y multiply to U, recomputed here', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    const a = await readMatrix(figureByCaption(page, '#panel-exchange', 'A').first());
    const b = await readMatrix(figureByCaption(page, '#panel-exchange', 'B').first());
    const u = await readMatrix(figureByCaption(page, '#panel-exchange', /^U =/));

    await page.getByRole('tab', { name: 'The General Attack' }).click();
    const parse = async (selector: string): Promise<number[]> => {
      const text = (await page.locator(selector).textContent()) ?? '';
      return text
        .replace(/^[xy]\s*=\s*\(/, '')
        .replace(/\)$/, '')
        .split(',')
        .map((part) => Number(part.trim()));
    };
    const x = await parse('#panel-general .field-value:has-text("x =")');
    const y = await parse('#panel-general .field-value:has-text("y =")');

    // X = ⊕ xᵢ ⊗ A^⊗ⁱ and Y = ⊕ yⱼ ⊗ B^⊗ʲ, built here from the page's own
    // coefficients, must multiply to the page's own U.
    const combine = (coefficients: number[], m: number[][]): number[][] =>
      coefficients
        .map((c, i) => scalar(c, pow(m, i)))
        .reduce((acc, term) => acc.map((row, r) => row.map((v, s) => Math.min(v, term[r][s]))));
    expect(mul(combine(x, a), combine(y, b))).toEqual(u);
  });

  test('the trial counts shown sum to N', async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page);
    await page.getByRole('tab', { name: 'Many Trials' }).click();
    await page.locator('#run-trials').click();
    await expect(page.locator('#run-trials')).toBeEnabled({ timeout: 120_000 });

    // Parts sum to whole, read off the counts table the page rendered: for
    // each parameter set, recovered + found-nothing + wrong-key = instances.
    const rows = await page.locator('#panel-trials .counts-table tbody tr').all();
    expect(rows.length).toBe(3);
    for (const row of rows) {
      const cells = await row.locator('td.num').allTextContents();
      const [instances, recovered, nothing, wrong] = cells.map(Number);
      expect(recovered + nothing + wrong).toBe(instances);
      // The heuristic finds the key or finds nothing; it never returns a wrong
      // one. This is the counter that would say otherwise.
      expect(wrong).toBe(0);
    }

    const total = Number(
      await page.locator('[data-claim="trials-total"]').getAttribute('data-value'),
    );
    const summed = (
      await Promise.all(
        rows.map(async (row) => Number((await row.locator('td.num').first().textContent()) ?? 0)),
      )
    ).reduce((a, b) => a + b, 0);
    expect(total).toBe(summed);
  });

  test('changing the preset retires the stale verdict and its evidence', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    const before = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));

    await page.getByRole('button', { name: "Designers' parameters" }).click();
    await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toBeVisible();
    const after = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));
    // A different instance entirely: 10×10 rather than 3×3.
    expect(after.length).toBe(10);
    expect(after).not.toEqual(before);

    // And the attack panels speak about the NEW instance, not the old one.
    await page.getByRole('tab', { name: 'The Heuristic Attack' }).click();
    const honest = await readMatrix(
      figureByCaption(page, '#panel-heuristic', /The key Alice and Bob actually share/),
    );
    expect(honest).toEqual(after);
  });

  test('a no-op reselect does not retire a fresh verdict', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    await page.locator('#by-hand-editor > summary').click();
    // Apply without changing anything: the same instance must still be there,
    // with its verdict intact rather than retired or recomputed into something
    // else.
    const before = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));
    await page.locator('#apply-by-hand').click();
    await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toHaveAttribute(
      'data-result',
      'pass',
    );
    const after = await readMatrix(figureByCaption(page, '#panel-exchange', /computed by Alice/));
    expect(after).toEqual(before);
    await expect(page.locator('[data-verdict="by-hand-refused"]')).toHaveCount(0);
  });

  test('editing an input warns that the evidence is stale before it is applied', async ({
    page,
  }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    await page.locator('#by-hand-editor > summary').click();
    await page.locator('#edit-p1').fill('1, 2, 3');
    await expect(page.locator('#by-hand-editor .callout-caveat')).toContainText('Inputs changed');
  });

  test('a commuting pair is refused, and the page names the actual cause', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    await page.locator('#by-hand-editor > summary').click();
    const a = await page.locator('#edit-a').inputValue();
    await page.locator('#edit-b').fill(a);
    await page.locator('#apply-by-hand').click();
    const refusal = page.locator('[data-verdict="by-hand-refused"]');
    await expect(refusal).toHaveAttribute('data-result', 'fail');
    // The cause, not a generic failure.
    await expect(refusal).toContainText('A ⊗ B equals B ⊗ A');
    await expect(refusal).toContainText('carries no secret');
  });

  test('a non-integer coefficient is refused with its position', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Exchange' }).click();
    await page.locator('#by-hand-editor > summary').click();
    await page.locator('#edit-p1').fill('4, -7, 2.5');
    await page.locator('#apply-by-hand').click();
    await expect(page.locator('[data-verdict="by-hand-refused"]')).toContainText(
      'coefficient 3 ("2.5") is not an integer',
    );
  });

  test('the heuristic finding nothing is reported as that, never as secure', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'Where It Stops Working' }).click();
    const outcome = page.locator('[data-verdict="limits-outcome"]');
    await expect(outcome).toBeVisible();
    const text = (await outcome.textContent()) ?? '';
    // Whichever branch this draw took, the page must not call the key secure.
    expect(text).not.toMatch(/\bSECURE\b/i);
    expect(text).not.toMatch(/\bSAFE\b/i);
    // And the general attack still takes this instance.
    await expect(page.locator('[data-verdict="limits-general-outcome"]')).toHaveAttribute(
      'data-result',
      'alarm',
    );
  });

  /**
   * ── THE NEGATIVE CLAIM (§4.1d) ──
   *
   * Claim: "Both parties computing the same key says nothing about who else
   * can compute it: for this instance an eavesdropper who saw only A, B, U and
   * V has the same key."
   *
   * The fixture is exhibit 3 on the arrival instance. Three assertions:
   * reach it, everything the honest parties can check is GREEN, and the
   * limitation is on screen in that state.
   */
  test('negative claim: every honest check passes and the eavesdropper still has the key', async ({
    page,
  }) => {
    await boot(page);

    // 1. Reach the fixture, through the UI.
    await page.getByRole('tab', { name: 'The Exchange' }).click();

    // 2. EVERYTHING IS GREEN. Every verdict the honest parties can render in
    // this state reports success — asserted against the rendered verdicts, not
    // against a flag this test sets.
    await expect(page.locator('#panel-exchange [data-verdict="bases-noncommuting"]')).toHaveAttribute(
      'data-result',
      'pass',
    );
    await expect(page.locator('#panel-exchange [data-verdict="keys-agree"]')).toHaveAttribute(
      'data-result',
      'pass',
    );
    const honestVerdicts = await page
      .locator('#panel-exchange [data-verdict]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-result')));
    expect(honestVerdicts.length).toBeGreaterThan(0);
    expect(honestVerdicts.every((result) => result === 'pass')).toBe(true);

    // And the eavesdropper has the same key anyway.
    await page.getByRole('tab', { name: 'The Heuristic Attack' }).click();
    const outcome = page.locator('[data-verdict="heuristic-outcome"]');
    await expect(outcome).toHaveAttribute('data-result', 'alarm');
    // The verdict reads as success and failure at once.
    await expect(outcome).toContainText('KEYS AGREE — AND THE EAVESDROPPER HAS THE SAME KEY');

    // 3. THE LIMITATION IS ON SCREEN IN THAT STATE — visible, not in the
    // README and not behind a disclosure the reader has to open.
    const claim = page.locator('[data-negative-claim="eavesdropper-has-key"]');
    await expect(claim).toBeVisible();
    await expect(claim).toHaveText(
      'Both parties computing the same key says nothing about who else can compute it: for this ' +
        'instance an eavesdropper who saw only A, B, U and V has the same key.',
    );
    // Tied to the fixture: the parameter preset is named in the same state.
    await expect(page.locator('[data-claim="heuristic-preset"]')).toBeVisible();
    await expect(page.locator('[data-claim="heuristic-preset"]')).toHaveAttribute(
      'data-value',
      'by-hand',
    );
  });

  test('negative claim bite: a well-formed key that is not the session key reads NOT RECOVERED', async ({
    page,
  }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'The Heuristic Attack' }).click();
    await page.locator('#mismatch-fixture > summary').click();

    const produced = await readMatrix(
      figureByCaption(page, '#mismatch-fixture', /What the attack produced/),
    );
    const session = await readMatrix(
      figureByCaption(page, '#mismatch-fixture', /The actual session key/),
    );
    // The attack returned a matrix. It is not the key — compared here, cell by
    // cell, rather than taken from the page's own verdict.
    expect(produced).not.toEqual(session);
    const differing = produced.flat().filter((v, index) => v !== session.flat()[index]).length;
    expect(differing).toBe(9);

    // And the page says so.
    const outcome = page.locator('[data-verdict="mismatch-outcome"]');
    await expect(outcome).toHaveAttribute('data-result', 'fail');
    await expect(outcome).toContainText('KEY NOT RECOVERED');
    await expect(page.locator('[data-claim="mismatch-differing"]')).toHaveAttribute(
      'data-value',
      String(differing),
    );
  });

  /**
   * The `[hidden]` cascade probe (§4.1b).
   *
   * A class rule setting `display` outranks the UA's `[hidden]` rule, so an
   * element can paint while the code believes it is hidden. Four live
   * instances of that were found across this fleet in a single day. This asks
   * the rendered page rather than the stylesheet.
   */
  test('nothing marked [hidden] is actually painting', async ({ page }) => {
    await boot(page);
    const leaking = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[hidden]'))
        .filter((el) => (el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }))
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}`),
    );
    expect(leaking).toEqual([]);
    // And the probe is not vacuous: the page really does ship hidden panels.
    expect(await page.locator('[hidden]').count()).toBeGreaterThan(0);
  });
});
