import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, with
 * Min-Plus Arithmetic active and the other five tabpanels hidden and
 * UNRENDERED; the shared skip link focused; a traced product cell; both
 * answers of three quick checks; the exchange on its worked 3x3 instance, on
 * the all-positive instance, and at the designers' 10x10 preset where
 * twelve-digit entries fill a ten-column table; the by-hand editor's two
 * refusal states, each with an `aria-invalid` control and a failure verdict;
 * the heuristic scan stepped forward, back and selected directly, plus the
 * wrong-message fixture; the non-negative preset where the scan finds nothing;
 * the general attack's cover, coefficients and recovered key with its solver
 * explainer open; a real trial run in flight and completed; two hover states;
 * two focus rings; and a matrix scroll region focused, which is this lab's one
 * genuinely scrollable element class. Every one of those states is scanned, at
 * desktop and phone width.
 *
 * Dark is the only theme, so there is one theme loop rather than two.
 *
 * See `gate.ts` for why nothing is injected into the page, why no panel is
 * revealed from script, why the lab's defaults are asserted rather than
 * assumed, and why `violations` is not the whole oracle.
 */

test('no WCAG A/AA violations across every driven state', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await boot(page);
  await driveAllStates(page, 'dark');
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});

test('no WCAG A/AA violations across every driven state at 380px', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await page.setViewportSize(NARROW);
  await boot(page);
  await driveAllStates(page, 'dark @380px');
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});
