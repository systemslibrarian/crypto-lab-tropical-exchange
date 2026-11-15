/**
 * Uniform integers from `crypto.getRandomValues`, by rejection sampling.
 *
 * Two rules, both from the brief's invariant 5:
 *
 *  - NO `Math.random`. It is not a CSPRNG, and a lab that measures attack
 *    success rates over thousands of instances is measuring a property of its
 *    own generator as much as of the attack.
 *  - NO MODULO BIAS. `value % range` over-represents the low end of the range
 *    whenever `range` does not divide the generator's period. At the designers'
 *    coefficient range [-1000, 1000] the bias would be invisible; at the matrix
 *    range [-10^10, 10^10] it would still be invisible, which is exactly why it
 *    gets shipped. Draw whole bits and reject instead.
 *
 * The widest range here spans 2·10^10 + 1 values, which needs 35 bits — past
 * what one `Uint32` holds. So the draw takes as many 32-bit words as the range
 * needs, assembles them as a non-negative integer, and rejects anything at or
 * above the range. The assembled value stays under 2^53 by construction: the
 * widest range needs 35 bits, and the guard below refuses anything wider.
 */

import { TropicalError, type Matrix, type Trop } from './tropical.js';

/**
 * The source of randomness. A parameter so tests can pin a sequence.
 *
 * The buffer is typed `Uint32Array<ArrayBuffer>` rather than a bare
 * `Uint32Array`, because the latter also admits a `SharedArrayBuffer` backing
 * and `crypto.getRandomValues` refuses those at runtime — it throws rather
 * than filling a buffer another thread could be reading.
 */
export interface RandomSource {
  getRandomValues(array: Uint32Array<ArrayBuffer>): Uint32Array<ArrayBuffer>;
}

/** The browser/Node Web Crypto generator. */
export const webCryptoSource: RandomSource = {
  getRandomValues: (array) => crypto.getRandomValues(array),
};

/**
 * A uniform integer in [lo, hi], both inclusive.
 *
 * Rejection sampling: draw `bits` uniform bits, where `bits` is the smallest
 * number covering the range, and discard any draw that lands outside. The
 * expected number of draws is below 2 for every range, because `2^bits` is less
 * than twice the range by the choice of `bits`.
 */
export function uniformInt(lo: number, hi: number, source: RandomSource = webCryptoSource): number {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) {
    throw new TropicalError(`uniformInt: bounds must be safe integers, got [${lo}, ${hi}]`);
  }
  if (hi < lo) throw new TropicalError(`uniformInt: empty range [${lo}, ${hi}]`);
  const range = hi - lo + 1;
  if (range === 1) return lo;
  if (!Number.isSafeInteger(range)) {
    throw new TropicalError(`uniformInt: range ${range} exceeds exact integer arithmetic`);
  }
  const bits = Math.ceil(Math.log2(range));
  if (bits > 48) {
    throw new TropicalError(`uniformInt: ${bits}-bit range is wider than this sampler supports`);
  }
  const words = bits <= 32 ? 1 : 2;
  const buffer = new Uint32Array(new ArrayBuffer(words * 4));
  for (;;) {
    source.getRandomValues(buffer);
    let value: number;
    if (words === 1) {
      // `>>> 0` for the 32-bit case: shifting a Uint32 right by 0 is a no-op in
      // JS but `>>> 32` is also a no-op (shift counts are taken mod 32), which
      // would silently return all 32 bits when only some were wanted.
      value = bits === 32 ? buffer[0] >>> 0 : buffer[0] >>> (32 - bits);
    } else {
      const high = buffer[1] >>> (64 - bits);
      value = high * 0x1_0000_0000 + buffer[0];
    }
    if (value < range) return lo + value;
  }
}

/** An n×n matrix with entries uniform in [lo, hi]. */
export function randomMatrix(
  n: number,
  lo: number,
  hi: number,
  source: RandomSource = webCryptoSource,
): Matrix {
  return Array.from({ length: n }, () =>
    Array.from({ length: n }, () => uniformInt(lo, hi, source)),
  );
}

/**
 * A polynomial as a coefficient list, lowest degree first.
 *
 * The degree is drawn uniformly from [degreeLo, degreeHi] and the list then has
 * degree + 1 entries — the constant term included, per the paper's sums from
 * i = 0. See `evalPoly` for why that term is load-bearing.
 */
export function randomPoly(
  degreeLo: number,
  degreeHi: number,
  coefficientLo: number,
  coefficientHi: number,
  source: RandomSource = webCryptoSource,
): Trop[] {
  const degree = uniformInt(degreeLo, degreeHi, source);
  return Array.from({ length: degree + 1 }, () =>
    uniformInt(coefficientLo, coefficientHi, source),
  );
}
