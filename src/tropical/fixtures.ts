/**
 * The worked instances this lab is tested and taught against.
 *
 * EVERY VALUE HERE IS AN EXPECTED VALUE, not a computed one. They come from the
 * build brief's acceptance checks, which derived them independently of any
 * implementation, and check A's powers are additionally the ones printed in
 * Kotov and Ushakov section 2. Nothing in this file is produced by the code it
 * tests — that is the point of it.
 *
 * The paper's matrix is reproduced here as a known-answer vector, the same way
 * a lab reproduces an RFC's test vectors. The source is cited in the README.
 */

import type { Matrix, Trop } from './tropical.js';

/**
 * ── CHECK A ──
 * The 3×3 matrix printed in Kotov and Ushakov section 2, with its tropical
 * powers as the paper prints them. Entries were chosen uniformly in [-100, 100]
 * there, and the powers are what the paper uses to argue that entries "very
 * soon become negative and decrease linearly with i".
 */
export const PAPER_A: Matrix = [
  [-42, 13, -96],
  [-28, 16, 65],
  [-85, 31, -75],
];

/** A^⊗2 … A^⊗5, exactly as printed in the paper. */
export const PAPER_A_POWERS: Readonly<Record<2 | 3 | 4 | 5, Matrix>> = {
  2: [
    [-181, -65, -171],
    [-70, -15, -124],
    [-160, -72, -181],
  ],
  3: [
    [-256, -168, -277],
    [-209, -93, -199],
    [-266, -150, -256],
  ],
  4: [
    [-362, -246, -352],
    [-284, -196, -305],
    [-341, -253, -362],
  ],
  5: [
    [-437, -349, -458],
    [-390, -274, -380],
    [-447, -331, -437],
  ],
};

/**
 * ── CHECK B ── Hand-sized instance 1: the heuristic succeeds.
 *
 * A is the paper's matrix; B, the four polynomials and every expected matrix
 * below come from the brief. Coefficient lists are lowest degree first.
 */
export interface HandInstance {
  readonly id: string;
  readonly a: Matrix;
  readonly b: Matrix;
  readonly p1: readonly Trop[];
  readonly p2: readonly Trop[];
  readonly q1: readonly Trop[];
  readonly q2: readonly Trop[];
  readonly expected: {
    /**
     * A ⊗ B and B ⊗ A, where the brief states them. Absent for instance C,
     * where the brief states only that the two differ — so the test asserts
     * non-commutation there rather than numbers no source published.
     */
    readonly ab?: Matrix;
    readonly ba?: Matrix;
    readonly p1A: Matrix;
    readonly p2B: Matrix;
    readonly u: Matrix;
    readonly v: Matrix;
    readonly key: Matrix;
    /** The heuristic's first hit, or null when it finds nothing. */
    readonly heuristic: { i: number; j: number; c: Trop } | null;
  };
}

export const INSTANCE_B: HandInstance = {
  id: 'heuristic-succeeds',
  a: PAPER_A,
  b: [
    [57, -23, 10],
    [-64, 3, -91],
    [38, -70, -12],
  ],
  p1: [4, -7, 2],
  p2: [-3, 9, -5, 1],
  q1: [6, 0, -8],
  q2: [-2, 5],
  expected: {
    ab: [
      [-58, -166, -108],
      [-48, -51, -75],
      [-37, -145, -87],
    ],
    ba: [
      [-75, -7, -65],
      [-176, -60, -166],
      [-98, -54, -87],
    ],
    p1A: [
      [-179, -63, -169],
      [-68, -13, -122],
      [-158, -70, -179],
    ],
    p2B: [
      [-123, -183, -150],
      [-224, -172, -251],
      [-145, -230, -172],
    ],
    u: [
      [-314, -399, -341],
      [-267, -352, -294],
      [-324, -409, -351],
    ],
    v: [
      [-191, -244, -186],
      [-89, -197, -139],
      [-170, -254, -196],
    ],
    key: [
      [-647, -595, -674],
      [-600, -548, -627],
      [-657, -605, -684],
    ],
    // c is the sum of the two leading coefficients, 2 + 1.
    heuristic: { i: 2, j: 3, c: 3 },
  },
};

/**
 * ── CHECK C ── Hand-sized instance 2: the heuristic finds nothing, the general
 * attack succeeds.
 *
 * All entries are non-negative, which is the setting the paper's Table 1 puts
 * at a 2 percent heuristic success rate. This instance also exercises the
 * constant term: dropping it changes U, V and K here, where in instance B it
 * changes none of them.
 */
export const INSTANCE_C: HandInstance = {
  id: 'heuristic-fails',
  a: [
    [97, 9, 17],
    [79, 79, 56],
    [16, 16, 0],
  ],
  b: [
    [0, 26, 99],
    [27, 21, 21],
    [37, 40, 25],
  ],
  p1: [20, 6, 5, 6],
  p2: [9, 0, 11],
  q1: [5, 4, 8],
  q2: [10, 9],
  expected: {
    p1A: [
      [20, 15, 22],
      [77, 20, 61],
      [21, 21, 5],
    ],
    p2B: [
      [0, 26, 58],
      [27, 9, 21],
      [37, 40, 9],
    ],
    u: [
      [20, 24, 31],
      [47, 29, 41],
      [21, 30, 14],
    ],
    v: [
      [14, 23, 31],
      [41, 15, 35],
      [29, 30, 14],
    ],
    key: [
      [34, 39, 45],
      [61, 44, 56],
      [34, 44, 28],
    ],
    heuristic: null,
  },
};

/**
 * One valid answer for instance C's general attack, for orientation only.
 *
 * The solution is NOT unique — any (x, y) satisfying the equalities and
 * inequalities works — so the tests assert the four break conditions rather
 * than these particular vectors. This is here so a reader can check one.
 */
export const INSTANCE_C_GENERAL_EXAMPLE = {
  x: [0, -14, -15, 0] as readonly Trop[],
  y: [29, 20, 20, 20] as readonly Trop[],
};

/**
 * ── THE NEGATIVE-CLAIM BITE FIXTURE ──
 *
 * A DIFFERENT Alice's message against instance B's session. Keep A, B and Bob's
 * q1, q2, but give the attacker U' from p1 = (1, 5, 3), p2 = (0, -4, 2) while
 * the session key stays instance B's K.
 *
 * The heuristic fires on U' — it finds i = 2, j = 2, c = 5 — and produces a
 * perfectly well-formed key that is NOT K. It is the fixture that separates
 * "the attack returned a matrix" from "the attack recovered the key", and the
 * page has to say the key was not recovered.
 */
export const MISMATCHED_MESSAGE = {
  p1: [1, 5, 3] as readonly Trop[],
  p2: [0, -4, 2] as readonly Trop[],
  u: [
    [-300, -248, -327],
    [-253, -201, -280],
    [-310, -258, -337],
  ] as Matrix,
  heuristic: { i: 2, j: 2, c: 5 },
  /** What the heuristic produces from U' against instance B's V. Not K. */
  producedKey: [
    [-496, -581, -523],
    [-449, -534, -476],
    [-506, -591, -533],
  ] as Matrix,
};
