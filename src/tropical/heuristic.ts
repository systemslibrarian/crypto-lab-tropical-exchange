/**
 * The one-line heuristic — Kotov and Ushakov section 2.
 *
 * ── Why it works ──
 * Entries of A^⊗i go negative and fall roughly linearly in i: each power adds
 * another row of (mostly negative) entries into a running minimum. By i = 2 or
 * so the entries of A^⊗i are already far below anything a coefficient drawn
 * from [-1000, 1000] can shift. So in p1(A) = ⊕ c_i ⊗ A^⊗i the leading
 * monomial swallows every other term:
 *
 *     p1(A) = c_d ⊗ A^⊗d     for all i, with the designers' coefficients
 *
 * and the same for p2(B). Then U = p1(A) ⊗ p2(B) is just c ⊗ A^⊗i ⊗ B^⊗j for
 * one pair (i, j) and one constant c — and X = c ⊗ A^⊗i, Y = B^⊗j satisfy the
 * break condition, because a polynomial in A commutes with A.
 *
 * ── The test ──
 * For each i, j in [1, D], form T = U − (A^⊗i ⊗ B^⊗j). If every entry of T is
 * the SAME number c, the factorisation has been found. There is nothing
 * probabilistic about the check: it either holds for an (i, j) or it does not.
 *
 * ── Why it never returns a wrong key ──
 * A constant difference means U = c ⊗ A^⊗i ⊗ B^⊗j exactly, so X ⊗ Y = U holds
 * exactly, so X ⊗ V ⊗ Y is the shared key by the protocol's own algebra. The
 * attack fails by finding nothing, never by finding something false. That was
 * measured over 30,000 instances when this lab's expected values were derived,
 * and `verifyRecovery` below re-checks it on every single run anyway: a verdict
 * is the comparison's result, never the attack's self-report.
 */

import {
  matEq,
  matMul,
  matPow,
  matSub,
  powers,
  scalarMul,
  type Matrix,
  type Trop,
} from './tropical.js';
import type { PublicTranscript } from './protocol.js';

/** One (i, j) cell of the scan, as the exhibit renders it. */
export interface ScanStep {
  readonly i: number;
  readonly j: number;
  /** T = U − A^⊗i ⊗ B^⊗j, the matrix the learner is asked to look at. */
  readonly difference: Matrix;
  /** The candidate constant: T's top-left entry. */
  readonly candidate: Trop;
  /** How many of T's cells equal that candidate. */
  readonly matching: number;
  /** n², so the exhibit can say "3 of 9" rather than only "no". */
  readonly cells: number;
  /** True exactly when every cell matches. */
  readonly constant: boolean;
}

export interface HeuristicResult {
  /** Every (i, j) tried, in order, up to and including the hit. */
  readonly steps: readonly ScanStep[];
  /** The hit, or null when the scan found no constant difference. */
  readonly found: { i: number; j: number; c: Trop; x: Matrix; y: Matrix } | null;
  /** How many (i, j) pairs were examined. */
  readonly tried: number;
}

/**
 * Scan (i, j) over [1, D] × [1, D] for a constant difference.
 *
 * SIGNATURE IS THE INVARIANT. This takes a `PublicTranscript` — A, B, U, V and
 * nothing else. There is no parameter through which a secret could arrive, so
 * invariant 2 is a property of the type rather than a promise in a comment.
 *
 * The scan runs i outermost then j, which is the order the paper's description
 * implies and the order the exhibit shows. It matters for what the FIRST hit
 * is when several (i, j) work; the acceptance check pins the hit at i = 2,
 * j = 3 for the worked instance, so a reordering is visible.
 */
export function heuristicAttack(
  transcript: PublicTranscript,
  maxDegree: number,
  options: { collectSteps?: boolean } = {},
): HeuristicResult {
  const { a, b, u } = transcript;
  const collect = options.collectSteps ?? true;
  const aPowers = powers(a, maxDegree);
  const bPowers = powers(b, maxDegree);
  const steps: ScanStep[] = [];
  let tried = 0;

  for (let i = 1; i <= maxDegree; i++) {
    for (let j = 1; j <= maxDegree; j++) {
      tried++;
      const difference = matSub(u, matMul(aPowers[i], bPowers[j]));
      const candidate = difference[0][0];
      let matching = 0;
      for (const row of difference) for (const value of row) if (value === candidate) matching++;
      const cells = u.length * u.length;
      const constant = matching === cells;
      if (collect) steps.push({ i, j, difference, candidate, matching, cells, constant });
      if (constant) {
        return {
          steps,
          tried,
          found: {
            i,
            j,
            c: candidate,
            // X = c ⊗ A^⊗i. The scalar is NOT optional: without it X ⊗ Y is
            // A^⊗i ⊗ B^⊗j, which differs from U by exactly c in every entry,
            // and the recovered key comes out short by c everywhere.
            x: scalarMul(candidate, aPowers[i]),
            y: bPowers[j],
          },
        };
      }
    }
  }
  return { steps, tried, found: null };
}

/**
 * What an attacker computes once it holds X and Y: X ⊗ V ⊗ Y.
 *
 * By the break condition (section 1.3), any X, Y with X ⊗ A = A ⊗ X,
 * Y ⊗ B = B ⊗ Y and X ⊗ Y = U give the key this way — whether or not X is
 * Alice's p1(A).
 */
export function keyFrom(x: Matrix, v: Matrix, y: Matrix): Matrix {
  return matMul(matMul(x, v), y);
}

/** The three conditions of the break, each reported separately. */
export interface BreakConditions {
  readonly xCommutesWithA: boolean;
  readonly yCommutesWithB: boolean;
  readonly productEqualsU: boolean;
  readonly all: boolean;
}

export function checkBreakConditions(
  transcript: PublicTranscript,
  x: Matrix,
  y: Matrix,
): BreakConditions {
  const xCommutesWithA = matEq(matMul(x, transcript.a), matMul(transcript.a, x));
  const yCommutesWithB = matEq(matMul(y, transcript.b), matMul(transcript.b, y));
  const productEqualsU = matEq(matMul(x, y), transcript.u);
  return {
    xCommutesWithA,
    yCommutesWithB,
    productEqualsU,
    all: xCommutesWithA && yCommutesWithB && productEqualsU,
  };
}

/**
 * The verdict rule for the whole lab, in one place.
 *
 * A key counts as RECOVERED only when it equals, entry by entry, the key the
 * honest parties computed. "The attack returned a matrix" is not recovery, and
 * neither is "the attack said it succeeded". Invariant 1.
 */
export interface RecoveryVerdict {
  readonly recovered: boolean;
  readonly conditions: BreakConditions;
  readonly candidateKey: Matrix | null;
  /** Cells where the candidate and the true key differ — empty iff recovered. */
  readonly mismatches: { i: number; j: number; a: Trop; b: Trop }[];
}

export function verifyRecovery(
  transcript: PublicTranscript,
  trueKey: Matrix,
  x: Matrix | null,
  y: Matrix | null,
): RecoveryVerdict {
  if (x === null || y === null) {
    return {
      recovered: false,
      conditions: {
        xCommutesWithA: false,
        yCommutesWithB: false,
        productEqualsU: false,
        all: false,
      },
      candidateKey: null,
      mismatches: [],
    };
  }
  const conditions = checkBreakConditions(transcript, x, y);
  const candidateKey = keyFrom(x, transcript.v, y);
  const mismatches: { i: number; j: number; a: Trop; b: Trop }[] = [];
  for (let i = 0; i < trueKey.length; i++) {
    for (let j = 0; j < trueKey[i].length; j++) {
      if (candidateKey[i][j] !== trueKey[i][j]) {
        mismatches.push({ i, j, a: candidateKey[i][j], b: trueKey[i][j] });
      }
    }
  }
  return { recovered: mismatches.length === 0, conditions, candidateKey, mismatches };
}

/**
 * The exhibit that shows WHY the heuristic works: the entries of A^⊗i falling
 * away as i grows, against the width of the coefficient range.
 *
 * Returns, per power, the minimum and maximum finite entry. A coefficient can
 * only matter while its range still spans the gap between consecutive powers.
 */
export function powerDecay(
  a: Matrix,
  maxPower: number,
): { power: number; min: Trop; max: Trop }[] {
  const out: { power: number; min: Trop; max: Trop }[] = [];
  for (let k = 1; k <= maxPower; k++) {
    const m = matPow(a, k);
    let min = Infinity;
    let max = -Infinity;
    for (const row of m) {
      for (const value of row) {
        if (value === Infinity) continue;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    out.push({ power: k, min, max });
  }
  return out;
}
