import { describe, expect, it } from 'vitest';
import { presetById } from './protocol.js';
import { rate, runTrials } from './trials.js';

/**
 * ── ACCEPTANCE CHECK E — the measured success rates ──
 *
 * At least 1,000 fresh instances per preset for the heuristic and at least 200
 * for the general attack, with every recovered key compared entry by entry
 * against the honest one.
 *
 * The bands are the brief's, and they are deliberately WIDE: these are
 * measurements of a random process, and a band tight enough to flake would be
 * a worse test than no test. What they pin is the shape the paper reports —
 * near-certain at the designers' parameters, roughly three-in-four with wide
 * coefficients, almost never with non-negative entries — and in particular
 * that the non-negative row is single-digit rather than double. The brief
 * notes the first thing to check if a run lands outside: whether the constant
 * term is included in polynomial evaluation. Without it the three rates move
 * to roughly 99.7 / 79.7 / 14.2 percent, and the third of those is outside its
 * band by a factor of four.
 *
 * This file is NOT in the default `npm test` run — it takes tens of seconds.
 * It runs under `npm run test:slow`, which CI executes as its own step.
 */

interface Band {
  readonly id: 'designers' | 'wide-coefficients' | 'non-negative';
  readonly published: number;
  readonly low: number;
  readonly high: number;
}

const BANDS: readonly Band[] = [
  { id: 'designers', published: 97, low: 95, high: 99.5 },
  { id: 'wide-coefficients', published: 71, low: 67, high: 78 },
  { id: 'non-negative', published: 2, low: 0.3, high: 3.5 },
];

const HEURISTIC_TRIALS = 1000;
const GENERAL_TRIALS = 200;

describe('measured success rates against the published ones', () => {
  for (const band of BANDS) {
    it(
      `${band.id}: heuristic lands in [${band.low}%, ${band.high}%] over ${HEURISTIC_TRIALS} instances`,
      { timeout: 600_000 },
      () => {
        const preset = presetById(band.id);
        const counts = runTrials({
          preset,
          trials: HEURISTIC_TRIALS,
          generalTrials: GENERAL_TRIALS,
        });

        expect(counts.completed).toBe(HEURISTIC_TRIALS);

        // Invariant 1, as a counter: the heuristic either finds the key or
        // finds nothing. A non-zero count here would mean a "recovered" key
        // that did not match, which no run has ever produced.
        expect(counts.heuristicWrongKey).toBe(0);

        // The parts sum to the whole — the counts are counted, not derived.
        expect(counts.heuristicRecovered + counts.heuristicFoundNothing).toBe(counts.completed);

        const measured = rate(counts.heuristicRecovered, counts.completed)!;
        expect(measured).toBeGreaterThanOrEqual(band.low);
        expect(measured).toBeLessThanOrEqual(band.high);

        // The general attack, on the same instances, recovers every key.
        expect(counts.generalAttempted).toBe(GENERAL_TRIALS);
        expect(counts.generalRecovered).toBe(GENERAL_TRIALS);
        expect(counts.generalNoSolution).toBe(0);
        expect(counts.generalBudgetExhausted).toBe(0);

        // Reported, not asserted: the number a reader would compare with the
        // paper's. Printed so a CI log carries the measurement itself.
        console.log(
          `${band.id}: heuristic ${counts.heuristicRecovered}/${counts.completed} ` +
            `(${measured.toFixed(1)}%, paper ${band.published}%) · ` +
            `general ${counts.generalRecovered}/${counts.generalAttempted} (paper 100%) · ` +
            `max |key entry| ${counts.maxAbsKeyEntry.toExponential(2)} · ` +
            `${(counts.heuristicMs / counts.completed).toFixed(2)} ms/heuristic, ` +
            `${(counts.generalMs / counts.generalAttempted).toFixed(2)} ms/general`,
        );
      },
    );
  }

  it('every key entry stays a safe integer across every preset', { timeout: 600_000 }, () => {
    // The brief measured about 4.3 × 10^11 as the largest absolute key entry
    // at the widest setting. This asserts the property rather than the number:
    // whatever the run produces must be exactly representable.
    for (const band of BANDS) {
      const counts = runTrials({
        preset: presetById(band.id),
        trials: 200,
        generalTrials: 0,
      });
      expect(Number.isSafeInteger(counts.maxAbsKeyEntry)).toBe(true);
      expect(counts.maxAbsKeyEntry).toBeLessThan(Number.MAX_SAFE_INTEGER);
    }
  });
});
