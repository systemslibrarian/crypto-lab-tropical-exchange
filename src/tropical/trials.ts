/**
 * Many fresh instances per preset, counted.
 *
 * INVARIANT 6: every number this produces is COUNTED, never extrapolated. There
 * is no sampling shortcut, no "the first 50 were all successes so assume the
 * rest", and no rate carried over from a previous run. `completed` is the
 * denominator and it only moves when an instance has actually been generated,
 * attacked and checked.
 *
 * INVARIANT 1 applies to every single trial: a success is recorded only when
 * the recovered key equals the honest key entry by entry. The attack reporting
 * success is not success. That is why `heuristicWrongKey` exists at all — it is
 * a counter that must stay at zero, and a run that moved it would be reporting
 * something the paper and this lab's own 30,000-instance measurement both say
 * does not happen.
 */

import { generalAttack } from './general.js';
import { heuristicAttack, verifyRecovery } from './heuristic.js';
import { publicView, runExchange, type Preset } from './protocol.js';
import { maxAbsFinite } from './tropical.js';
import { webCryptoSource, type RandomSource } from './random.js';

export interface TrialCounts {
  /** Instances actually completed. The denominator for every rate below. */
  completed: number;
  /** The heuristic found a constant difference AND the key matched. */
  heuristicRecovered: number;
  /** The heuristic found nothing. */
  heuristicFoundNothing: number;
  /**
   * The heuristic returned a key that did NOT match. Must stay zero; it is
   * reported rather than assumed away.
   */
  heuristicWrongKey: number;
  /** Instances on which the general attack was run (it is slower). */
  generalAttempted: number;
  /** The general attack recovered the key, checked entry by entry. */
  generalRecovered: number;
  /** The general attack found no solution. */
  generalNoSolution: number;
  /** The general attack hit its cover budget. */
  generalBudgetExhausted: number;
  /** Largest absolute key entry seen, so the page can show the magnitudes. */
  maxAbsKeyEntry: number;
  /** Total milliseconds spent inside the heuristic. */
  heuristicMs: number;
  /** Total milliseconds spent inside the general attack. */
  generalMs: number;
}

export function emptyCounts(): TrialCounts {
  return {
    completed: 0,
    heuristicRecovered: 0,
    heuristicFoundNothing: 0,
    heuristicWrongKey: 0,
    generalAttempted: 0,
    generalRecovered: 0,
    generalNoSolution: 0,
    generalBudgetExhausted: 0,
    maxAbsKeyEntry: 0,
    heuristicMs: 0,
    generalMs: 0,
  };
}

export interface TrialOptions {
  readonly preset: Preset;
  readonly trials: number;
  /** Run the general attack on the first `generalTrials` instances only. */
  readonly generalTrials: number;
  readonly source?: RandomSource;
  /** Called after each instance so a worker can report progress. */
  readonly onProgress?: (counts: TrialCounts) => void;
  /** Checked between instances so a worker run can be cancelled. */
  readonly shouldStop?: () => boolean;
}

/**
 * Run `trials` fresh exchanges and attack each one.
 *
 * Every instance is independent: new A, B (regenerated until they do not
 * commute), new polynomials, both keys computed and compared. Nothing is
 * reused between instances, so the counts are over genuinely fresh draws.
 */
export function runTrials(options: TrialOptions): TrialCounts {
  const { preset, trials, generalTrials, source = webCryptoSource } = options;
  const counts = emptyCounts();
  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  for (let trial = 0; trial < trials; trial++) {
    if (options.shouldStop?.()) break;

    const session = runExchange({ preset, source });
    const transcript = publicView(session);
    counts.maxAbsKeyEntry = Math.max(counts.maxAbsKeyEntry, maxAbsFinite(session.aliceKey));

    const heuristicStart = now();
    const heuristic = heuristicAttack(transcript, preset.degreeHi, { collectSteps: false });
    counts.heuristicMs += now() - heuristicStart;

    if (heuristic.found === null) {
      counts.heuristicFoundNothing++;
    } else {
      const verdict = verifyRecovery(
        transcript,
        session.aliceKey,
        heuristic.found.x,
        heuristic.found.y,
      );
      // The comparison decides, not the attack's own report.
      if (verdict.recovered) counts.heuristicRecovered++;
      else counts.heuristicWrongKey++;
    }

    if (trial < generalTrials) {
      counts.generalAttempted++;
      const generalStart = now();
      const general = generalAttack(transcript, preset.degreeHi);
      counts.generalMs += now() - generalStart;
      if (general.status === 'budget-exhausted') {
        counts.generalBudgetExhausted++;
      } else if (general.status === 'no-solution') {
        counts.generalNoSolution++;
      } else {
        const verdict = verifyRecovery(
          transcript,
          session.aliceKey,
          general.xMatrix,
          general.yMatrix,
        );
        if (verdict.recovered) counts.generalRecovered++;
        else counts.generalNoSolution++;
      }
    }

    counts.completed++;
    options.onProgress?.({ ...counts });
  }

  return counts;
}

/**
 * A percentage from two counted integers, or null when nothing was counted.
 *
 * Null rather than 0 or NaN: "no trials have run" and "zero percent" are
 * different statements, and a page that renders the first as the second is
 * claiming a measurement it does not have.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

/** One decimal place, with the sign of a percentage. */
export function formatRate(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}
