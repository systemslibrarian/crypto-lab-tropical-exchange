/**
 * The tropical (min-plus) semiring, and matrices over it.
 *
 * a ⊕ b = min(a, b)      a ⊗ b = a + b
 *
 * The additive identity is +infinity (the neutral element of `min`) and the
 * multiplicative identity is 0 (the neutral element of `+`). There are no
 * additive inverses, which is the whole reason the linear-algebra attacks that
 * sank Stickel's scheme over an ordinary ring do not transfer directly — and
 * the reason Grigoriev and Shpilrain proposed this platform at all.
 *
 * Everything here is hand-rolled rather than taken from a library: the algebra
 * IS the teaching subject, so every operation has to be openable.
 *
 * ── Why plain JavaScript numbers are exact here ──────────────────────────────
 * Entries are integers. The widest preset draws matrix entries uniformly from
 * [-10^10, 10^10], and a shared key at those parameters reaches roughly
 * 4.3 × 10^11 in absolute value — three orders of magnitude below 2^53, where
 * doubles stop representing consecutive integers. So the arithmetic below is
 * exact, and `assertFinite` checks that rather than assuming it: every finite
 * entry entering or leaving these routines must be a safe integer.
 *
 * `Infinity` is a legitimate entry — it is every off-diagonal cell of the
 * identity matrix — so it is accepted. What is never allowed is the one shape
 * that produces `NaN`: `Infinity - Infinity`. `subtract` below refuses it by
 * name rather than quietly returning `NaN` into a comparison that would then
 * read as "not equal" and look like a result.
 */

/** An entry of the tropical semiring: an integer, or +infinity (the zero of ⊕). */
export type Trop = number;

/** A matrix over the tropical semiring, row-major, always square here. */
export type Matrix = readonly (readonly Trop[])[];

/** The additive identity of the semiring: `min(x, INF) === x` for every x. */
export const INF = Infinity;

/** Thrown when a value that must be a finite safe integer is not. */
export class TropicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TropicalError';
  }
}

/**
 * Every finite entry must be a SAFE integer.
 *
 * Checked rather than assumed. Above 2^53 doubles skip integers, so a sum would
 * silently round and every downstream comparison — including the entry-by-entry
 * key comparison this lab's verdicts are built on — would be comparing values
 * the arithmetic never actually produced.
 */
export function assertFinite(value: Trop, what: string): void {
  if (value === INF) return;
  if (!Number.isFinite(value)) {
    throw new TropicalError(`${what}: entries must be integers or +infinity, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new TropicalError(
      `${what}: ${value} is not a safe integer — beyond 2^53 this arithmetic stops being exact`,
    );
  }
}

/** Validate a whole matrix: square, non-empty, every entry a safe integer or +infinity. */
export function assertMatrix(m: Matrix, what = 'matrix'): void {
  if (!Array.isArray(m) || m.length === 0) {
    throw new TropicalError(`${what}: must be a non-empty square matrix`);
  }
  for (let i = 0; i < m.length; i++) {
    const row = m[i];
    if (!Array.isArray(row) || row.length !== m.length) {
      throw new TropicalError(`${what}: row ${i} has length ${row?.length}, expected ${m.length}`);
    }
    for (let j = 0; j < row.length; j++) assertFinite(row[j], `${what}[${i}][${j}]`);
  }
}

export function size(m: Matrix): number {
  return m.length;
}

/** The tropical identity: 0 on the diagonal, +infinity elsewhere. */
export function identity(n: number): Matrix {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TropicalError(`identity: size must be a positive integer, got ${n}`);
  }
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)));
}

/** Matrix ⊕: entrywise minimum. */
export function matAdd(x: Matrix, y: Matrix): Matrix {
  if (x.length !== y.length) throw new TropicalError('matAdd: size mismatch');
  return x.map((row, i) => row.map((v, j) => Math.min(v, y[i][j])));
}

/**
 * Matrix ⊗: (X ⊗ Y)[i][j] = min over k of X[i][k] + Y[k][j].
 *
 * The ordinary matrix product with `+` for `×` and `min` for `+`. This single
 * substitution is the whole platform.
 */
export function matMul(x: Matrix, y: Matrix): Matrix {
  const n = x.length;
  if (y.length !== n) throw new TropicalError('matMul: size mismatch');
  const out: Trop[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = x[i];
    const result: Trop[] = new Array(n);
    for (let j = 0; j < n; j++) {
      let best = INF;
      for (let k = 0; k < n; k++) {
        const candidate = row[k] + y[k][j];
        if (candidate < best) best = candidate;
      }
      result[j] = best;
    }
    out[i] = result;
  }
  return out;
}

/**
 * The minimising index behind one cell of a product, for the exhibit that shows
 * ⊗ being computed cell by cell. Returns every k attaining the minimum, because
 * ties happen and hiding them would misrepresent the computation.
 */
export function mulCellTrace(
  x: Matrix,
  y: Matrix,
  i: number,
  j: number,
): { terms: { k: number; value: Trop }[]; min: Trop; argmin: number[] } {
  const terms = x[i].map((_, k) => ({ k, value: x[i][k] + y[k][j] }));
  const min = terms.reduce((acc, t) => Math.min(acc, t.value), INF);
  return { terms, min, argmin: terms.filter((t) => t.value === min).map((t) => t.k) };
}

/** Scalar ⊗ matrix: c ⊗ X adds c to every entry (because ⊗ is `+`). */
export function scalarMul(c: Trop, x: Matrix): Matrix {
  assertFinite(c, 'scalarMul: scalar');
  return x.map((row) => row.map((v) => v + c));
}

/** All powers A^⊗0 … A^⊗d, cached together because every caller wants the run. */
export function powers(a: Matrix, d: number): Matrix[] {
  if (!Number.isSafeInteger(d) || d < 0) {
    throw new TropicalError(`powers: degree must be a non-negative integer, got ${d}`);
  }
  const out: Matrix[] = [identity(a.length)];
  for (let i = 1; i <= d; i++) out.push(matMul(out[i - 1], a));
  return out;
}

/** A^⊗k. */
export function matPow(a: Matrix, k: number): Matrix {
  return powers(a, k)[k];
}

/**
 * p(A) = ⊕ over i from 0 to d of c_i ⊗ A^⊗i, with coefficients lowest degree
 * first and A^⊗0 the identity.
 *
 * THE CONSTANT TERM IS INCLUDED. Kotov and Ushakov's sums run from i = 0, and
 * the choice is not cosmetic: dropping it moves the measured heuristic success
 * rates to roughly 99.7 / 79.7 / 14.2 percent, against the paper's published
 * 97 / 71 / 2. The constant term contributes `c_0 ⊗ I`, which is finite only on
 * the diagonal, so it changes the product in exactly the cells where the
 * identity is finite.
 */
export function evalPoly(coefficients: readonly Trop[], a: Matrix): Matrix {
  if (coefficients.length === 0) throw new TropicalError('evalPoly: no coefficients');
  return evalPolyWithPowers(coefficients, powers(a, coefficients.length - 1));
}

/**
 * Same as `evalPoly` but reusing a precomputed power run (the hot path).
 *
 * `evalPoly` delegates here rather than repeating the loop, so the sum's lower
 * bound — the decision in the doc comment above — exists in exactly one place.
 * Two copies of it is two places for the constant term to be dropped from, and
 * a mutation that proves one is included proves nothing about the other.
 */
export function evalPolyWithPowers(coefficients: readonly Trop[], pows: readonly Matrix[]): Matrix {
  if (coefficients.length === 0) throw new TropicalError('evalPolyWithPowers: no coefficients');
  if (coefficients.length > pows.length) {
    throw new TropicalError('evalPolyWithPowers: not enough precomputed powers');
  }
  let acc: Matrix | null = null;
  for (let i = 0; i < coefficients.length; i++) {
    const term = scalarMul(coefficients[i], pows[i]);
    acc = acc === null ? term : matAdd(acc, term);
  }
  return acc as Matrix;
}

/** Entry-by-entry equality. This is what every "recovered" verdict in the lab rests on. */
export function matEq(x: Matrix, y: Matrix): boolean {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].length !== y[i].length) return false;
    for (let j = 0; j < x[i].length; j++) if (x[i][j] !== y[i][j]) return false;
  }
  return true;
}

/** Every cell where two matrices differ, for showing a comparison rather than asserting it. */
export function diffCells(x: Matrix, y: Matrix): { i: number; j: number; a: Trop; b: Trop }[] {
  const out: { i: number; j: number; a: Trop; b: Trop }[] = [];
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < x[i].length; j++) {
      if (x[i][j] !== y[i][j]) out.push({ i, j, a: x[i][j], b: y[i][j] });
    }
  }
  return out;
}

/**
 * Entrywise X − Y, refusing the one subtraction that has no answer.
 *
 * `Infinity - Infinity` is `NaN`, and a `NaN` propagated into a comparison
 * reads as "these differ" — a false negative dressed as a result. Both attacks
 * subtract matrices (the heuristic computes U − A^⊗i ⊗ B^⊗j, the general attack
 * computes A^⊗i ⊗ B^⊗j − U), and when i = j = 0 the first operand is the
 * identity, whose off-diagonal entries are +infinity. The second operand, U, is
 * always finite — it is a product of two polynomial evaluations, each of which
 * includes a finite power — so `INF - finite = INF` is a real answer and is
 * allowed through. Two infinities in the same cell is not, and throws.
 */
export function matSub(x: Matrix, y: Matrix): Matrix {
  if (x.length !== y.length) throw new TropicalError('matSub: size mismatch');
  return x.map((row, i) =>
    row.map((v, j) => {
      const w = y[i][j];
      if (v === INF && w === INF) {
        throw new TropicalError(
          `matSub: cell [${i}][${j}] is +infinity in both operands; infinity minus infinity has no value`,
        );
      }
      return v - w;
    }),
  );
}

/** Do A and B commute under ⊗? The protocol requires that they do NOT. */
export function commutes(a: Matrix, b: Matrix): boolean {
  return matEq(matMul(a, b), matMul(b, a));
}

/** The largest finite absolute entry, used to report magnitudes honestly. */
export function maxAbsFinite(m: Matrix): number {
  let max = 0;
  for (const row of m) for (const v of row) if (v !== INF && Math.abs(v) > max) max = Math.abs(v);
  return max;
}

/** Render one entry: a bare integer, or the ∞ glyph for the additive identity. */
export function formatEntry(value: Trop): string {
  return value === INF ? '∞' : String(value);
}

/** `[[1, 2], [3, 4]]` as a compact one-line string, for titles and copy actions. */
export function formatMatrix(m: Matrix): string {
  return `[${m.map((row) => `[${row.map(formatEntry).join(', ')}]`).join(', ')}]`;
}

/**
 * Parse a matrix the learner typed. Fails closed on everything: a non-integer,
 * a ragged row, a non-square shape, an out-of-range entry.
 *
 * Accepts the same bracketed form `formatMatrix` emits, plus whitespace- and
 * newline-separated rows, because both are what people actually paste.
 */
export function parseMatrix(text: string, expectedSize?: number): Matrix {
  const rows = text
    .replace(/^\s*\[\s*/, '')
    .replace(/\s*\]\s*$/, '')
    .split(/\]\s*,?\s*\[|\n/)
    .map((row) => row.replace(/[[\]]/g, '').trim())
    .filter((row) => row.length > 0);
  if (rows.length === 0) throw new TropicalError('Enter a matrix: no rows found.');
  const parsed = rows.map((row, i) => {
    const cells = row.split(/[,\s]+/).filter((c) => c.length > 0);
    return cells.map((cell, j) => {
      if (!/^[+-]?\d+$/.test(cell)) {
        throw new TropicalError(
          `Row ${i + 1}, entry ${j + 1}: "${cell}" is not an integer. Entries must be whole numbers.`,
        );
      }
      const value = Number(cell);
      if (!Number.isSafeInteger(value)) {
        throw new TropicalError(
          `Row ${i + 1}, entry ${j + 1}: ${cell} is beyond 2^53, where this arithmetic stops being exact.`,
        );
      }
      return value;
    });
  });
  const n = parsed.length;
  for (const [i, row] of parsed.entries()) {
    if (row.length !== n) {
      throw new TropicalError(
        `Row ${i + 1} has ${row.length} entries but the matrix has ${n} rows; it must be square.`,
      );
    }
  }
  if (expectedSize !== undefined && n !== expectedSize) {
    throw new TropicalError(`Expected a ${expectedSize}×${expectedSize} matrix, got ${n}×${n}.`);
  }
  return parsed;
}
