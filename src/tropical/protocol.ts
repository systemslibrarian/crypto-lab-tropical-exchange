/**
 * The Grigoriev–Shpilrain key exchange over tropical matrices, as restated in
 * Kotov and Ushakov, "Analysis of a key exchange protocol based on tropical
 * matrix algebra" (ePrint 2015/852) section 1.2.
 *
 *   Public: n×n tropical matrices A, B with A ⊗ B ≠ B ⊗ A.
 *   Alice:  picks polynomials p1, p2; sends U = p1(A) ⊗ p2(B).
 *   Bob:    picks polynomials q1, q2; sends V = q1(A) ⊗ q2(B).
 *   Alice:  K_A = p1(A) ⊗ V ⊗ p2(B).
 *   Bob:    K_B = q1(A) ⊗ U ⊗ q2(B).
 *
 * Both sides compute p1(A) ⊗ q1(A) ⊗ q2(B) ⊗ p2(B), because p1(A) commutes
 * with q1(A) — both are polynomials in A — and likewise for the B side. That
 * commutation is the whole mechanism, and it is also the whole weakness: it
 * means ANY X commuting with A and Y commuting with B, whose product is U,
 * recovers the key, whether or not they are Alice's actual secrets.
 *
 * ── The designers' key generation (section 1.2, attributed there to the design
 * paper's section 2.5) ──
 *   n = 10; entries of A and B uniform in [-10^10, 10^10]; each polynomial's
 *   degree uniform in [1, 10]; coefficients uniform in [-1000, 1000].
 */

import {
  commutes,
  evalPolyWithPowers,
  matMul,
  powers,
  TropicalError,
  type Matrix,
  type Trop,
} from './tropical.js';
import { randomMatrix, randomPoly, webCryptoSource, type RandomSource } from './random.js';

/** The degree bound D both attacks search up to. The protocol's own bound. */
export const MAX_DEGREE = 10;

/** A named parameter set. The three rate rows plus a hand-sized teaching preset. */
export interface Preset {
  readonly id: PresetId;
  /** Short label for a control. */
  readonly label: string;
  /** Matrix size n. */
  readonly n: number;
  /** Matrix entries uniform in [matrixLo, matrixHi]. */
  readonly matrixLo: number;
  readonly matrixHi: number;
  /** Polynomial coefficients uniform in [coefficientLo, coefficientHi]. */
  readonly coefficientLo: number;
  readonly coefficientHi: number;
  /** Polynomial degree uniform in [degreeLo, degreeHi]. */
  readonly degreeLo: number;
  readonly degreeHi: number;
  /** The paper's Table 1 heuristic success rate, where it published one. */
  readonly publishedHeuristicRate: number | null;
  /** The paper's Table 2 general-attack success rate, where it published one. */
  readonly publishedGeneralRate: number | null;
  /** How this row is described in the paper's tables. */
  readonly note: string;
}

export type PresetId = 'designers' | 'wide-coefficients' | 'non-negative' | 'by-hand';

/**
 * The three rows of the paper's tables, plus a 3×3 preset small enough to read.
 *
 * The published rates are the paper's own, over 100 instances each, on 2015
 * hardware in GAP. They are reproduced here as what the paper measured, never
 * as a guarantee: this lab reports its own counts beside them.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'designers',
    label: "Designers' parameters",
    n: 10,
    matrixLo: -1e10,
    matrixHi: 1e10,
    coefficientLo: -1000,
    coefficientHi: 1000,
    degreeLo: 1,
    degreeHi: 10,
    publishedHeuristicRate: 97,
    publishedGeneralRate: 100,
    note: 'Coefficients [-10³, 10³], matrix entries [-10¹⁰, 10¹⁰] — exactly as proposed.',
  },
  {
    id: 'wide-coefficients',
    label: 'Wide coefficients',
    n: 10,
    matrixLo: -1e10,
    matrixHi: 1e10,
    coefficientLo: -1e10,
    coefficientHi: 1e10,
    degreeLo: 1,
    degreeHi: 10,
    publishedHeuristicRate: 71,
    publishedGeneralRate: 100,
    note: 'Coefficients widened to [-10¹⁰, 10¹⁰] so they can compete with the powers.',
  },
  {
    id: 'non-negative',
    label: 'Non-negative entries',
    n: 10,
    matrixLo: 0,
    matrixHi: 1e10,
    coefficientLo: 0,
    coefficientHi: 1e10,
    degreeLo: 1,
    degreeHi: 10,
    publishedHeuristicRate: 2,
    publishedGeneralRate: 100,
    note: 'Everything non-negative, so powers no longer run away downward.',
  },
  {
    id: 'by-hand',
    label: '3×3 by hand',
    n: 3,
    matrixLo: -100,
    matrixHi: 100,
    coefficientLo: -10,
    coefficientHi: 10,
    degreeLo: 1,
    degreeHi: 3,
    publishedHeuristicRate: null,
    publishedGeneralRate: null,
    note: 'Small enough to check with a pencil. Not a parameter set anyone proposed.',
  },
];

export function presetById(id: PresetId): Preset {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new TropicalError(`unknown preset: ${id}`);
  return found;
}

/** Everything an eavesdropper sees. The attackers take exactly this and no more. */
export interface PublicTranscript {
  readonly a: Matrix;
  readonly b: Matrix;
  /** Alice's message, U = p1(A) ⊗ p2(B). */
  readonly u: Matrix;
  /** Bob's message, V = q1(A) ⊗ q2(B). */
  readonly v: Matrix;
}

/** One party's secret polynomials and the matrices they evaluate to. */
export interface PartySecrets {
  readonly first: readonly Trop[];
  readonly second: readonly Trop[];
  readonly firstEvaluated: Matrix;
  readonly secondEvaluated: Matrix;
}

/** A complete session: the transcript, both parties' secrets, and both keys. */
export interface Session {
  readonly preset: PresetId;
  readonly transcript: PublicTranscript;
  readonly alice: PartySecrets;
  readonly bob: PartySecrets;
  /** K_A = p1(A) ⊗ V ⊗ p2(B). */
  readonly aliceKey: Matrix;
  /** K_B = q1(A) ⊗ U ⊗ q2(B). */
  readonly bobKey: Matrix;
  /** Whether the two agree, measured rather than assumed. */
  readonly keysAgree: boolean;
}

/**
 * Strip a session down to what an eavesdropper has.
 *
 * Invariant 2 is enforced by the attack functions' own signatures — they take a
 * `PublicTranscript`, which has no field holding a secret — and this is the one
 * place a `Session` becomes one, so there is a single line to read.
 */
export function publicView(session: Session): PublicTranscript {
  return session.transcript;
}

/**
 * Generate a public pair A, B that does NOT commute.
 *
 * Invariant 4: a commuting pair is rejected and redrawn. With commuting bases
 * every party's message would be a polynomial in a single commutative algebra
 * and the "exchange" would carry no secret at all. Random pairs essentially
 * never commute, so the loop normally runs once; the bound exists so a
 * degenerate generator cannot hang the page.
 */
export function generateBases(
  preset: Preset,
  source: RandomSource = webCryptoSource,
  maxAttempts = 100,
): { a: Matrix; b: Matrix; attempts: number } {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const a = randomMatrix(preset.n, preset.matrixLo, preset.matrixHi, source);
    const b = randomMatrix(preset.n, preset.matrixLo, preset.matrixHi, source);
    if (!commutes(a, b)) return { a, b, attempts: attempt };
  }
  throw new TropicalError(
    `generateBases: ${maxAttempts} draws all produced commuting A, B — the generator is degenerate`,
  );
}

/**
 * Run one full exchange.
 *
 * Both keys are computed independently, the way the two parties would, and
 * compared. `keysAgree` is the result of that comparison and never a constant:
 * the one mutation that makes Bob use his own message instead of Alice's has to
 * be visible here.
 */
export function runExchange(options: {
  preset: Preset;
  a?: Matrix;
  b?: Matrix;
  p1?: readonly Trop[];
  p2?: readonly Trop[];
  q1?: readonly Trop[];
  q2?: readonly Trop[];
  source?: RandomSource;
}): Session {
  const { preset, source = webCryptoSource } = options;
  let a = options.a;
  let b = options.b;
  if (a === undefined || b === undefined) {
    const bases = generateBases(preset, source);
    a = bases.a;
    b = bases.b;
  }
  assertUsableBases(a, b);

  const draw = (): Trop[] =>
    randomPoly(preset.degreeLo, preset.degreeHi, preset.coefficientLo, preset.coefficientHi, source);
  const p1 = options.p1 ?? draw();
  const p2 = options.p2 ?? draw();
  const q1 = options.q1 ?? draw();
  const q2 = options.q2 ?? draw();
  for (const [name, poly] of [
    ['p1', p1],
    ['p2', p2],
    ['q1', q1],
    ['q2', q2],
  ] as const) {
    assertDegreeInRange(name, poly, preset);
  }

  const maxDegree = Math.max(p1.length, p2.length, q1.length, q2.length) - 1;
  const aPowers = powers(a, maxDegree);
  const bPowers = powers(b, maxDegree);

  const p1A = evalPolyWithPowers(p1, aPowers);
  const p2B = evalPolyWithPowers(p2, bPowers);
  const q1A = evalPolyWithPowers(q1, aPowers);
  const q2B = evalPolyWithPowers(q2, bPowers);

  const u = matMul(p1A, p2B);
  const v = matMul(q1A, q2B);

  // Each party uses the OTHER party's message. Alice folds V between her own
  // two secrets; Bob folds U between his.
  const aliceKey = matMul(matMul(p1A, v), p2B);
  const bobKey = matMul(matMul(q1A, u), q2B);

  return {
    preset: preset.id,
    transcript: { a, b, u, v },
    alice: { first: p1, second: p2, firstEvaluated: p1A, secondEvaluated: p2B },
    bob: { first: q1, second: q2, firstEvaluated: q1A, secondEvaluated: q2B },
    aliceKey,
    bobKey,
    keysAgree: keysMatch(aliceKey, bobKey),
  };
}

/** The comparison behind `keysAgree`, named so one mutation can target it. */
function keysMatch(aliceKey: Matrix, bobKey: Matrix): boolean {
  if (aliceKey.length !== bobKey.length) return false;
  for (let i = 0; i < aliceKey.length; i++) {
    for (let j = 0; j < aliceKey[i].length; j++) {
      if (aliceKey[i][j] !== bobKey[i][j]) return false;
    }
  }
  return true;
}

/** Fail closed on a commuting pair, with the reason a learner needs. */
export function assertUsableBases(a: Matrix, b: Matrix): void {
  if (a.length !== b.length) {
    throw new TropicalError(`A is ${a.length}×${a.length} but B is ${b.length}×${b.length}.`);
  }
  if (commutes(a, b)) {
    throw new TropicalError(
      'A ⊗ B equals B ⊗ A, so this pair cannot be used: with commuting bases every message is a ' +
        'polynomial in one commutative algebra and the exchange carries no secret. Pick a different B.',
    );
  }
}

/** Fail closed on a degree outside the preset's range. */
export function assertDegreeInRange(name: string, poly: readonly Trop[], preset: Preset): void {
  const degree = poly.length - 1;
  if (degree < preset.degreeLo || degree > preset.degreeHi) {
    throw new TropicalError(
      `${name} has degree ${degree}, outside this preset's range ${preset.degreeLo}..${preset.degreeHi}.`,
    );
  }
}

/**
 * Parse a coefficient list the learner typed: "4, -7, 2", lowest degree first.
 */
export function parsePoly(text: string, preset: Preset, name: string): Trop[] {
  const cells = text.split(/[,\s]+/).filter((c) => c.length > 0);
  if (cells.length === 0) throw new TropicalError(`${name}: enter at least one coefficient.`);
  const coefficients = cells.map((cell, i) => {
    if (!/^[+-]?\d+$/.test(cell)) {
      throw new TropicalError(`${name}: coefficient ${i + 1} ("${cell}") is not an integer.`);
    }
    const value = Number(cell);
    if (!Number.isSafeInteger(value)) {
      throw new TropicalError(`${name}: coefficient ${i + 1} is beyond 2^53.`);
    }
    return value;
  });
  assertDegreeInRange(name, coefficients, preset);
  return coefficients;
}
