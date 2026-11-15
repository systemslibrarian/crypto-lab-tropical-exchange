import { describe, expect, it } from 'vitest';
import {
  MAX_DEGREE,
  PRESETS,
  assertDegreeInRange,
  assertUsableBases,
  generateBases,
  parsePoly,
  presetById,
  publicView,
  runExchange,
} from './protocol.js';
import { INSTANCE_B, INSTANCE_C, PAPER_A, type HandInstance } from './fixtures.js';
import { INF, TropicalError, commutes, matEq, matMul, matPow } from './tropical.js';

const byHand = presetById('by-hand');

/**
 * The same polynomial with its sum running from i = 1 instead of i = 0.
 *
 * The constant coefficient becomes +infinity, the additive identity of ⊕, so
 * the i = 0 term contributes nothing to the minimum. Deleting the entry instead
 * would also lower the DEGREE by one, which is a different change — and one the
 * preset's degree gate correctly refuses when it takes a degree-1 polynomial
 * down to a constant.
 */
function withoutConstantTerm(poly: readonly number[]): number[] {
  return [INF, ...poly.slice(1)];
}

/** Re-run a hand instance exactly as the brief specifies it. */
function run(instance: HandInstance) {
  return runExchange({
    preset: byHand,
    a: instance.a,
    b: instance.b,
    p1: instance.p1,
    p2: instance.p2,
    q1: instance.q1,
    q2: instance.q2,
  });
}

describe('acceptance check B — hand-sized instance 1', () => {
  const session = run(INSTANCE_B);

  it('A ⊗ B and B ⊗ A are the brief’s matrices, and they differ', () => {
    expect(matMul(INSTANCE_B.a, INSTANCE_B.b)).toEqual(INSTANCE_B.expected.ab);
    expect(matMul(INSTANCE_B.b, INSTANCE_B.a)).toEqual(INSTANCE_B.expected.ba);
    expect(commutes(INSTANCE_B.a, INSTANCE_B.b)).toBe(false);
  });

  it('U is p1(A) ⊗ p2(B)', () => {
    expect(session.transcript.u).toEqual(INSTANCE_B.expected.u);
  });

  it('V is q1(A) ⊗ q2(B)', () => {
    expect(session.transcript.v).toEqual(INSTANCE_B.expected.v);
  });

  it('both parties compute the brief’s shared key', () => {
    expect(session.aliceKey).toEqual(INSTANCE_B.expected.key);
    expect(session.bobKey).toEqual(INSTANCE_B.expected.key);
    expect(session.keysAgree).toBe(true);
  });
});

describe('acceptance check C — hand-sized instance 2', () => {
  const session = run(INSTANCE_C);

  it('A and B do not commute', () => {
    expect(commutes(INSTANCE_C.a, INSTANCE_C.b)).toBe(false);
  });

  it('U, V and the shared key are the brief’s matrices', () => {
    expect(session.transcript.u).toEqual(INSTANCE_C.expected.u);
    expect(session.transcript.v).toEqual(INSTANCE_C.expected.v);
    expect(session.aliceKey).toEqual(INSTANCE_C.expected.key);
    expect(session.bobKey).toEqual(INSTANCE_C.expected.key);
    expect(session.keysAgree).toBe(true);
  });

  it('dropping the constant term changes U, V and K here', () => {
    // The brief: this instance exercises the constant term, where instance B
    // does not. Asserted both ways so the difference between the two instances
    // is itself a measurement.
    const stripped = runExchange({
      preset: byHand,
      a: INSTANCE_C.a,
      b: INSTANCE_C.b,
      p1: withoutConstantTerm(INSTANCE_C.p1),
      p2: withoutConstantTerm(INSTANCE_C.p2),
      q1: withoutConstantTerm(INSTANCE_C.q1),
      q2: withoutConstantTerm(INSTANCE_C.q2),
    });
    expect(matEq(stripped.transcript.u, INSTANCE_C.expected.u)).toBe(false);
    expect(matEq(stripped.transcript.v, INSTANCE_C.expected.v)).toBe(false);
    expect(matEq(stripped.aliceKey, INSTANCE_C.expected.key)).toBe(false);
  });

  it('dropping the constant term leaves instance B’s U and K unchanged', () => {
    // Which is exactly why one worked instance cannot settle the question, and
    // why mutation (2) is recorded against check C rather than check B.
    const stripped = runExchange({
      preset: byHand,
      a: INSTANCE_B.a,
      b: INSTANCE_B.b,
      p1: withoutConstantTerm(INSTANCE_B.p1),
      p2: withoutConstantTerm(INSTANCE_B.p2),
      q1: withoutConstantTerm(INSTANCE_B.q1),
      q2: withoutConstantTerm(INSTANCE_B.q2),
    });
    expect(stripped.transcript.u).toEqual(INSTANCE_B.expected.u);
    expect(stripped.aliceKey).toEqual(INSTANCE_B.expected.key);
  });
});

describe('acceptance check D — protocol algebra on random instances', () => {
  for (const preset of PRESETS) {
    it(`both parties agree on a fresh ${preset.id} instance`, () => {
      // Three instances per preset here; the 1,000-instance sweep is the slow
      // suite. Each one is a full independent exchange.
      for (let trial = 0; trial < 3; trial++) {
        const session = runExchange({ preset });
        expect(session.keysAgree).toBe(true);
        expect(session.aliceKey).toEqual(session.bobKey);
      }
    });

    it(`p1(A) commutes with A on a fresh ${preset.id} instance`, () => {
      const session = runExchange({ preset });
      expect(commutes(session.alice.firstEvaluated, session.transcript.a)).toBe(true);
      expect(commutes(session.alice.secondEvaluated, session.transcript.b)).toBe(true);
      expect(commutes(session.bob.firstEvaluated, session.transcript.a)).toBe(true);
      expect(commutes(session.bob.secondEvaluated, session.transcript.b)).toBe(true);
    });
  }

  it('the generated bases never commute', () => {
    for (const preset of PRESETS) {
      for (let trial = 0; trial < 5; trial++) {
        const { a, b, attempts } = generateBases(preset);
        expect(commutes(a, b)).toBe(false);
        expect(attempts).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('fail-closed paths', () => {
  it('refuses a commuting pair, naming the reason', () => {
    // B = A^⊗2 commutes with A, so this pair is unusable.
    expect(() => assertUsableBases(PAPER_A, matPow(PAPER_A, 2))).toThrow(
      /A ⊗ B equals B ⊗ A/,
    );
  });

  it('refuses a commuting pair inside runExchange, not only at the gate', () => {
    expect(() =>
      runExchange({ preset: byHand, a: PAPER_A, b: matPow(PAPER_A, 3) }),
    ).toThrow(TropicalError);
  });

  it('refuses mismatched matrix sizes', () => {
    expect(() => assertUsableBases(PAPER_A, [[1, 2], [3, 4]])).toThrow(/3×3 but B is 2×2/);
  });

  it('refuses a degree below the preset’s range', () => {
    // by-hand allows degrees 1..3; a bare constant is degree 0.
    expect(() => assertDegreeInRange('p1', [5], byHand)).toThrow(/degree 0, outside/);
  });

  it('refuses a degree above the preset’s range', () => {
    expect(() => assertDegreeInRange('p1', [1, 2, 3, 4, 5], byHand)).toThrow(/degree 4, outside/);
  });

  it('refuses a degree above 10 at the designers’ preset', () => {
    const designers = presetById('designers');
    const tooLong = new Array(12).fill(1);
    expect(() => assertDegreeInRange('p1', tooLong, designers)).toThrow(/degree 11, outside/);
    expect(designers.degreeHi).toBe(MAX_DEGREE);
  });

  it('refuses a non-integer coefficient in the by-hand input', () => {
    expect(() => parsePoly('4, -7, 2.5', byHand, 'p1')).toThrow(/not an integer/);
  });

  it('refuses an empty coefficient list', () => {
    expect(() => parsePoly('   ', byHand, 'p1')).toThrow(/at least one coefficient/);
  });

  it('parses a valid coefficient list lowest degree first', () => {
    expect(parsePoly('4, -7, 2', byHand, 'p1')).toEqual([4, -7, 2]);
  });
});

describe('invariant 2 — the eavesdropper’s view carries no secrets', () => {
  it('publicView exposes exactly A, B, U, V', () => {
    const session = run(INSTANCE_B);
    const view = publicView(session);
    expect(Object.keys(view).sort()).toEqual(['a', 'b', 'u', 'v']);
  });

  it('no field of the public view holds either party’s polynomials', () => {
    const session = run(INSTANCE_B);
    const serialised = JSON.stringify(publicView(session));
    // Alice's p2 is (-3, 9, -5, 1) and Bob's q1 is (6, 0, -8). Neither list may
    // appear in the transcript in any form.
    expect(serialised).not.toContain(JSON.stringify(INSTANCE_B.p2));
    expect(serialised).not.toContain(JSON.stringify(INSTANCE_B.q1));
    expect(serialised).not.toContain(JSON.stringify(INSTANCE_B.expected.p1A));
  });
});

describe('presets', () => {
  it('the designers’ preset is n = 10, entries ±10^10, coefficients ±1000, degrees 1..10', () => {
    const p = presetById('designers');
    expect([p.n, p.matrixLo, p.matrixHi, p.coefficientLo, p.coefficientHi, p.degreeLo, p.degreeHi])
      .toEqual([10, -1e10, 1e10, -1000, 1000, 1, 10]);
  });

  it('carries the paper’s published rates for the three measured rows', () => {
    expect(presetById('designers').publishedHeuristicRate).toBe(97);
    expect(presetById('wide-coefficients').publishedHeuristicRate).toBe(71);
    expect(presetById('non-negative').publishedHeuristicRate).toBe(2);
    for (const id of ['designers', 'wide-coefficients', 'non-negative'] as const) {
      expect(presetById(id).publishedGeneralRate).toBe(100);
    }
  });

  it('claims no published rate for the by-hand preset, which no paper measured', () => {
    expect(presetById('by-hand').publishedHeuristicRate).toBeNull();
    expect(presetById('by-hand').publishedGeneralRate).toBeNull();
  });

  it('refuses an unknown preset id', () => {
    expect(() => presetById('nonexistent' as never)).toThrow(/unknown preset/);
  });
});
