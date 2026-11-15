import { describe, expect, it } from 'vitest';
import {
  INF,
  TropicalError,
  assertFinite,
  assertMatrix,
  commutes,
  diffCells,
  evalPoly,
  formatEntry,
  formatMatrix,
  identity,
  matAdd,
  matEq,
  matMul,
  matPow,
  matSub,
  maxAbsFinite,
  mulCellTrace,
  parseMatrix,
  powers,
  scalarMul,
} from './tropical.js';
import { PAPER_A, PAPER_A_POWERS, INSTANCE_B, INSTANCE_C } from './fixtures.js';
import { uniformInt } from './random.js';

describe('the min-plus semiring', () => {
  it('⊕ is min and ⊗ is + on 1×1 matrices', () => {
    expect(matAdd([[3]], [[5]])).toEqual([[3]]);
    expect(matMul([[3]], [[5]])).toEqual([[8]]);
  });

  it('the identity has 0 on the diagonal and +infinity elsewhere', () => {
    expect(identity(3)).toEqual([
      [0, INF, INF],
      [INF, 0, INF],
      [INF, INF, 0],
    ]);
  });

  it('the identity is neutral under ⊗ on both sides', () => {
    const i = identity(3);
    expect(matMul(PAPER_A, i)).toEqual(PAPER_A);
    expect(matMul(i, PAPER_A)).toEqual(PAPER_A);
  });

  it('+infinity is neutral under ⊕', () => {
    const infinite = [
      [INF, INF],
      [INF, INF],
    ];
    expect(matAdd([[3, 4], [5, 6]], infinite)).toEqual([[3, 4], [5, 6]]);
  });

  it('a scalar adds to every entry, because ⊗ is +', () => {
    expect(scalarMul(7, [[0, 1], [2, 3]])).toEqual([[7, 8], [9, 10]]);
  });

  it('⊗ is associative on random triples', () => {
    const m = (seed: number): number[][] =>
      Array.from({ length: 4 }, (_, i) =>
        Array.from({ length: 4 }, (_, j) => ((seed * 31 + i * 7 + j * 13) % 97) - 48),
      );
    for (let seed = 1; seed <= 20; seed++) {
      const [x, y, z] = [m(seed), m(seed + 100), m(seed + 200)];
      expect(matMul(matMul(x, y), z)).toEqual(matMul(x, matMul(y, z)));
    }
  });

  it('(c ⊗ X) ⊗ Y equals c ⊗ (X ⊗ Y)', () => {
    const x = INSTANCE_B.a;
    const y = INSTANCE_B.b;
    for (const c of [-17, 0, 5, 1000]) {
      expect(matMul(scalarMul(c, x), y)).toEqual(scalarMul(c, matMul(x, y)));
    }
  });

  it('⊗ is NOT commutative — the property the protocol depends on', () => {
    expect(commutes(INSTANCE_B.a, INSTANCE_B.b)).toBe(false);
    expect(commutes(INSTANCE_C.a, INSTANCE_C.b)).toBe(false);
  });

  it('a matrix commutes with every power of itself', () => {
    for (let k = 0; k <= 5; k++) {
      expect(commutes(PAPER_A, matPow(PAPER_A, k))).toBe(true);
    }
  });

  it('a polynomial in A commutes with A — the protocol’s whole mechanism', () => {
    const pA = evalPoly(INSTANCE_B.p1, INSTANCE_B.a);
    expect(commutes(pA, INSTANCE_B.a)).toBe(true);
    const pB = evalPoly(INSTANCE_B.p2, INSTANCE_B.b);
    expect(commutes(pB, INSTANCE_B.b)).toBe(true);
  });

  it('reports the minimising index behind one product cell', () => {
    const trace = mulCellTrace([[1, 10], [3, 4]], [[5, 6], [0, 2]], 0, 0);
    expect(trace.terms).toEqual([
      { k: 0, value: 6 },
      { k: 1, value: 10 },
    ]);
    expect(trace.min).toBe(6);
    expect(trace.argmin).toEqual([0]);
  });

  it('reports every tied minimising index rather than only the first', () => {
    const trace = mulCellTrace([[1, 2]], [[5], [4]], 0, 0);
    expect(trace.min).toBe(6);
    expect(trace.argmin).toEqual([0, 1]);
  });
});

describe('spec known-answer vectors — Kotov and Ushakov section 2', () => {
  // The paper prints A and its powers A^⊗2 … A^⊗5. These are reproduced from
  // the publication, not from this code.
  for (const k of [2, 3, 4, 5] as const) {
    it(`reproduces the paper's printed A^⊗${k}`, () => {
      expect(matPow(PAPER_A, k)).toEqual(PAPER_A_POWERS[k]);
    });
  }

  it("entries fall as the power grows — the paper's own argument", () => {
    const maxima = ([2, 3, 4, 5] as const).map((k) =>
      Math.max(...PAPER_A_POWERS[k].flat()),
    );
    for (let i = 1; i < maxima.length; i++) {
      expect(maxima[i]).toBeLessThan(maxima[i - 1]);
    }
  });
});

describe('polynomial evaluation', () => {
  it('includes the constant term, as the paper’s sums from i = 0 require', () => {
    // With A = [[5]] and p = (0, 100): the constant term contributes 0 ⊗ I = 0,
    // and the degree-1 term contributes 100 + 5 = 105. min(0, 105) = 0.
    expect(evalPoly([0, 100], [[5]])).toEqual([[0]]);
    // Dropping the constant term would give 105.
    expect(evalPoly([100], [[5]])).toEqual([[100]]);
  });

  it('matches the brief’s expected p1(A) and p2(B) for instance B', () => {
    expect(evalPoly(INSTANCE_B.p1, INSTANCE_B.a)).toEqual(INSTANCE_B.expected.p1A);
    expect(evalPoly(INSTANCE_B.p2, INSTANCE_B.b)).toEqual(INSTANCE_B.expected.p2B);
  });

  it('matches the brief’s expected p1(A) and p2(B) for instance C', () => {
    expect(evalPoly(INSTANCE_C.p1, INSTANCE_C.a)).toEqual(INSTANCE_C.expected.p1A);
    expect(evalPoly(INSTANCE_C.p2, INSTANCE_C.b)).toEqual(INSTANCE_C.expected.p2B);
  });

  it('a degree-0 polynomial is a scalar times the identity', () => {
    expect(evalPoly([7], identity(2))).toEqual([
      [7, INF],
      [INF, 7],
    ]);
  });

  it('refuses an empty coefficient list', () => {
    expect(() => evalPoly([], PAPER_A)).toThrow(TropicalError);
  });
});

describe('subtraction and the infinity rule', () => {
  it('subtracts entrywise', () => {
    expect(matSub([[5, 2]], [[3, 9]])).toEqual([[2, -7]]);
  });

  it('allows +infinity minus a finite entry — the identity against U', () => {
    expect(matSub(identity(2), [[1, 2], [3, 4]])).toEqual([
      [-1, INF],
      [INF, -4],
    ]);
  });

  it('refuses +infinity minus +infinity by name, rather than returning NaN', () => {
    expect(() => matSub(identity(2), identity(2))).toThrow(/infinity minus infinity/);
  });
});

describe('safe-integer enforcement', () => {
  it('accepts +infinity as a legitimate entry', () => {
    expect(() => assertFinite(INF, 'entry')).not.toThrow();
  });

  it('rejects a non-safe integer', () => {
    expect(() => assertFinite(2 ** 53, 'entry')).toThrow(/not a safe integer/);
  });

  it('rejects NaN', () => {
    expect(() => assertFinite(NaN, 'entry')).toThrow(/must be integers/);
  });

  it('every entry of a key at the widest preset stays a safe integer', () => {
    // The brief measured the largest absolute key entry at about 4.3 × 10^11.
    // 2^53 is about 9.0 × 10^15, so there are four orders of magnitude of head
    // room — asserted rather than assumed.
    expect(maxAbsFinite(INSTANCE_B.expected.key)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(4.3e11)).toBe(true);
  });

  it('rejects a ragged or non-square matrix', () => {
    expect(() => assertMatrix([[1, 2], [3]])).toThrow(TropicalError);
    expect(() => assertMatrix([[1, 2]])).toThrow(TropicalError);
    expect(() => assertMatrix([])).toThrow(TropicalError);
  });
});

describe('comparison helpers', () => {
  it('matEq is entry by entry', () => {
    expect(matEq([[1, 2]], [[1, 2]])).toBe(true);
    expect(matEq([[1, 2]], [[1, 3]])).toBe(false);
    expect(matEq([[1]], [[1], [2]])).toBe(false);
  });

  it('diffCells names every differing cell', () => {
    expect(diffCells([[1, 2], [3, 4]], [[1, 9], [3, 8]])).toEqual([
      { i: 0, j: 1, a: 2, b: 9 },
      { i: 1, j: 1, a: 4, b: 8 },
    ]);
  });

  it('diffCells is empty exactly when matEq holds', () => {
    expect(diffCells(PAPER_A, PAPER_A)).toEqual([]);
  });
});

describe('formatting and parsing', () => {
  it('renders +infinity as ∞ and integers bare', () => {
    expect(formatEntry(INF)).toBe('∞');
    expect(formatEntry(-42)).toBe('-42');
  });

  it('round-trips a matrix through format and parse', () => {
    expect(parseMatrix(formatMatrix(PAPER_A))).toEqual(PAPER_A);
  });

  it('parses newline-separated rows', () => {
    expect(parseMatrix('1 2\n3 4')).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('refuses a non-integer entry, naming the cell', () => {
    expect(() => parseMatrix('[[1, 2.5], [3, 4]]')).toThrow(/Row 1, entry 2.*not an integer/);
  });

  it('refuses a non-square matrix, saying why', () => {
    expect(() => parseMatrix('[[1, 2, 3], [4, 5, 6]]')).toThrow(/must be square/);
  });

  it('refuses a matrix of the wrong size for the preset', () => {
    expect(() => parseMatrix('[[1, 2], [3, 4]]', 3)).toThrow(/Expected a 3×3 matrix, got 2×2/);
  });

  it('refuses an entry beyond 2^53', () => {
    expect(() => parseMatrix('[[9007199254740993]]')).toThrow(/beyond 2\^53/);
  });

  it('refuses empty input', () => {
    expect(() => parseMatrix('   ')).toThrow(/no rows found/);
  });
});

describe('uniform sampling', () => {
  it('returns the only value of a singleton range without consuming randomness', () => {
    const source = {
      getRandomValues: () => {
        throw new Error('should not be called');
      },
    } as never;
    expect(uniformInt(5, 5, source)).toBe(5);
  });

  it('stays within bounds across many draws', () => {
    for (let i = 0; i < 2000; i++) {
      const value = uniformInt(-1000, 1000);
      expect(value).toBeGreaterThanOrEqual(-1000);
      expect(value).toBeLessThanOrEqual(1000);
      expect(Number.isSafeInteger(value)).toBe(true);
    }
  });

  it('covers a 35-bit range exactly, including both endpoints', () => {
    // [-10^10, 10^10] needs 35 bits, past one Uint32 — the two-word path.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 5000; i++) {
      const value = uniformInt(-1e10, 1e10);
      expect(Number.isSafeInteger(value)).toBe(true);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    // A sample of 5,000 from a 2·10^10-wide range should reach both halves.
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(0);
  });

  it('rejects rather than taking a modulus — the low end is not over-represented', () => {
    // A range of 3 needs 2 bits, so one of the four draws (value 3) must be
    // rejected. Feed a source that returns 3 then 0 and check the 3 was
    // discarded rather than folded to 0 by a modulus.
    const queue = [3, 0];
    let calls = 0;
    const source = {
      getRandomValues: (array: Uint32Array<ArrayBuffer>) => {
        calls++;
        array[0] = (queue.shift() ?? 0) << 30; // the sampler takes the top bits
        return array;
      },
    };
    expect(uniformInt(0, 2, source)).toBe(0);
    expect(calls).toBe(2);
  });

  it('refuses an empty range and a non-integer bound', () => {
    expect(() => uniformInt(5, 4)).toThrow(/empty range/);
    expect(() => uniformInt(0.5, 4)).toThrow(/safe integers/);
  });

  it('is uniform enough that no bucket is wildly off over many draws', () => {
    // Not a randomness test — a smoke check that no bucket is starved, which
    // is what a modulo-bias bug looks like at a small range.
    const counts = new Array<number>(7).fill(0);
    const draws = 14000;
    for (let i = 0; i < draws; i++) counts[uniformInt(0, 6)]++;
    const expected = draws / 7;
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });
});

describe('powers', () => {
  it('powers(A, d) returns d + 1 matrices beginning with the identity', () => {
    const run = powers(PAPER_A, 4);
    expect(run).toHaveLength(5);
    expect(run[0]).toEqual(identity(3));
    expect(run[1]).toEqual(PAPER_A);
    expect(run[4]).toEqual(PAPER_A_POWERS[4]);
  });

  it('refuses a negative degree', () => {
    expect(() => powers(PAPER_A, -1)).toThrow(TropicalError);
  });
});
