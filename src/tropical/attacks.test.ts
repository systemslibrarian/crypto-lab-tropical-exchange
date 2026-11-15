import { describe, expect, it } from 'vitest';
import {
  checkBreakConditions,
  heuristicAttack,
  keyFrom,
  powerDecay,
  verifyRecovery,
} from './heuristic.js';
import { DEFAULT_COVER_BUDGET, generalAttack } from './general.js';
import { PRESETS, presetById, publicView, runExchange } from './protocol.js';
import {
  INSTANCE_B,
  INSTANCE_C,
  INSTANCE_C_GENERAL_EXAMPLE,
  MISMATCHED_MESSAGE,
  PAPER_A,
} from './fixtures.js';
import { matAdd, matEq, matMul, matPow, scalarMul, type Matrix } from './tropical.js';
import type { PublicTranscript } from './protocol.js';

const byHand = presetById('by-hand');

function sessionFor(instance: typeof INSTANCE_B) {
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

describe('the heuristic — acceptance check B', () => {
  const session = sessionFor(INSTANCE_B);
  const transcript = publicView(session);

  it('finds the brief’s (i, j, c) — i = 2, j = 3, c = 3', () => {
    const result = heuristicAttack(transcript, 3);
    expect(result.found).not.toBeNull();
    expect({ i: result.found!.i, j: result.found!.j, c: result.found!.c }).toEqual(
      INSTANCE_B.expected.heuristic,
    );
  });

  it('c is the sum of the two leading coefficients', () => {
    const result = heuristicAttack(transcript, 3);
    const leading = (p: readonly number[]): number => p[p.length - 1];
    expect(result.found!.c).toBe(leading(INSTANCE_B.p1) + leading(INSTANCE_B.p2));
  });

  it('the recovered key equals the honest key, entry by entry', () => {
    const result = heuristicAttack(transcript, 3);
    const verdict = verifyRecovery(
      transcript,
      session.aliceKey,
      result.found!.x,
      result.found!.y,
    );
    expect(verdict.recovered).toBe(true);
    expect(verdict.mismatches).toEqual([]);
    expect(verdict.candidateKey).toEqual(INSTANCE_B.expected.key);
  });

  it('X and Y satisfy all three break conditions', () => {
    const result = heuristicAttack(transcript, 3);
    const conditions = checkBreakConditions(transcript, result.found!.x, result.found!.y);
    expect(conditions).toEqual({
      xCommutesWithA: true,
      yCommutesWithB: true,
      productEqualsU: true,
      all: true,
    });
  });

  it('(2, 3) is the ONLY constant difference in the scan range', () => {
    // So a scan whose upper bound is D − 1 finds nothing at all — which is
    // what makes mutation (8) killable on this instance.
    const result = heuristicAttack(transcript, 3);
    const constants = result.steps.filter((s) => s.constant).map((s) => ({ i: s.i, j: s.j }));
    expect(constants).toEqual([{ i: 2, j: 3 }]);
  });

  it('a scan bounded at D − 1 finds nothing on this instance', () => {
    expect(heuristicAttack(transcript, 2).found).toBeNull();
  });

  it('records every (i, j) it tried, in i-then-j order', () => {
    const result = heuristicAttack(transcript, 3);
    expect(result.steps.slice(0, 4).map((s) => `${s.i},${s.j}`)).toEqual([
      '1,1',
      '1,2',
      '1,3',
      '2,1',
    ]);
    expect(result.tried).toBe(result.steps.length);
  });
});

describe('the heuristic — acceptance check C', () => {
  const session = sessionFor(INSTANCE_C);
  const transcript = publicView(session);

  it('finds no constant difference', () => {
    const result = heuristicAttack(transcript, 3);
    expect(result.found).toBeNull();
    expect(INSTANCE_C.expected.heuristic).toBeNull();
  });

  it('scans the whole 3 × 3 range before giving up', () => {
    expect(heuristicAttack(transcript, 3).tried).toBe(9);
  });

  it('reports "found nothing", which is not "secure"', () => {
    const result = heuristicAttack(transcript, 3);
    const verdict = verifyRecovery(transcript, session.aliceKey, null, null);
    expect(result.found).toBeNull();
    expect(verdict.recovered).toBe(false);
    // The general attack then recovers the key on this very instance, which is
    // the point: the heuristic failing says nothing about the protocol.
    const general = generalAttack(transcript, 3);
    expect(general.status).toBe('solved');
  });
});

describe('the heuristic never returns a wrong key', () => {
  it('a constant difference implies X ⊗ Y = U exactly', () => {
    // The structural reason, asserted rather than only measured: when the scan
    // fires, the product reproduces U on the nose, so the key follows by the
    // protocol's own algebra.
    for (const preset of PRESETS) {
      for (let trial = 0; trial < 4; trial++) {
        const session = runExchange({ preset });
        const transcript = publicView(session);
        const result = heuristicAttack(transcript, preset.degreeHi, { collectSteps: false });
        if (!result.found) continue;
        expect(matMul(result.found.x, result.found.y)).toEqual(transcript.u);
        const verdict = verifyRecovery(transcript, session.aliceKey, result.found.x, result.found.y);
        expect(verdict.recovered).toBe(true);
      }
    }
  });
});

describe('the general attack — acceptance checks B and C', () => {
  for (const instance of [INSTANCE_B, INSTANCE_C]) {
    describe(instance.id, () => {
      const session = sessionFor(instance);
      const transcript = publicView(session);

      it('solves the system', () => {
        expect(generalAttack(transcript, 3).status).toBe('solved');
      });

      it('X ⊗ Y equals U', () => {
        const result = generalAttack(transcript, 3);
        expect(matMul(result.xMatrix!, result.yMatrix!)).toEqual(transcript.u);
      });

      it('X commutes with A and Y commutes with B', () => {
        const result = generalAttack(transcript, 3);
        const conditions = checkBreakConditions(transcript, result.xMatrix!, result.yMatrix!);
        expect(conditions.xCommutesWithA).toBe(true);
        expect(conditions.yCommutesWithB).toBe(true);
      });

      it('X ⊗ V ⊗ Y equals the honest key, entry by entry', () => {
        const result = generalAttack(transcript, 3);
        const verdict = verifyRecovery(
          transcript,
          session.aliceKey,
          result.xMatrix,
          result.yMatrix,
        );
        expect(verdict.recovered).toBe(true);
        expect(verdict.candidateKey).toEqual(instance.expected.key);
      });

      it('returns integer coefficients', () => {
        const result = generalAttack(transcript, 3);
        for (const value of [...result.x!, ...result.y!]) {
          expect(Number.isSafeInteger(value)).toBe(true);
        }
      });
    });
  }

  it('recovers instance B’s key with an X that is NOT Alice’s p1(A)', () => {
    // The lesson of the break condition: the attacker does not need Alice's
    // secrets, only SOME pair satisfying the three conditions.
    const session = sessionFor(INSTANCE_B);
    const transcript = publicView(session);
    const result = generalAttack(transcript, 3);
    expect(matEq(result.xMatrix!, session.alice.firstEvaluated)).toBe(false);
    expect(verifyRecovery(transcript, session.aliceKey, result.xMatrix, result.yMatrix).recovered)
      .toBe(true);
  });

  it('the brief’s orientation answer for instance C satisfies the break conditions', () => {
    const session = sessionFor(INSTANCE_C);
    const transcript = publicView(session);
    const combine = (coefficients: readonly number[], m: Matrix): Matrix => {
      let acc: Matrix | null = null;
      for (let i = 0; i < coefficients.length; i++) {
        const term = scalarMul(coefficients[i], matPow(m, i));
        acc = acc === null ? term : matAdd(acc, term);
      }
      return acc as Matrix;
    };
    const x = combine(INSTANCE_C_GENERAL_EXAMPLE.x, INSTANCE_C.a);
    const y = combine(INSTANCE_C_GENERAL_EXAMPLE.y, INSTANCE_C.b);
    expect(checkBreakConditions(transcript, x, y).all).toBe(true);
    expect(keyFrom(x, transcript.v, y)).toEqual(INSTANCE_C.expected.key);
  });
});

describe('the general attack fails closed', () => {
  it('reports no solution when U is edited so none exists', () => {
    const session = sessionFor(INSTANCE_B);
    const broken: PublicTranscript = {
      ...publicView(session),
      u: session.transcript.u.map((row, i) => row.map((v, j) => (i === 0 && j === 0 ? v + 1 : v))),
    };
    const result = generalAttack(broken, 3);
    expect(result.status).toBe('no-solution');
    expect(result.xMatrix).toBeNull();
    expect(result.yMatrix).toBeNull();
  });

  it('reports budget exhaustion rather than silently returning nothing', () => {
    // A budget of zero cannot test a single cover, so the search has to say so.
    const session = sessionFor(INSTANCE_C);
    const result = generalAttack(publicView(session), 3, 0);
    expect(result.status).toBe('budget-exhausted');
    expect(result.budget).toBe(0);
    expect(result.xMatrix).toBeNull();
  });

  it('carries its budget in the result so the page can show it', () => {
    const session = sessionFor(INSTANCE_B);
    const result = generalAttack(publicView(session), 3);
    expect(result.budget).toBe(DEFAULT_COVER_BUDGET);
    expect(result.coversTested).toBeGreaterThan(0);
  });
});

describe('invariant 3 — a forged X, Y is rejected', () => {
  it('verifyRecovery reports productEqualsU false for a pair that does not multiply to U', () => {
    const session = sessionFor(INSTANCE_B);
    const transcript = publicView(session);
    // A pair that commutes correctly but whose product is not U: shift X by 1.
    const result = heuristicAttack(transcript, 3);
    const forgedX = scalarMul(1, result.found!.x);
    const verdict = verifyRecovery(transcript, session.aliceKey, forgedX, result.found!.y);
    expect(verdict.conditions.xCommutesWithA).toBe(true);
    expect(verdict.conditions.yCommutesWithB).toBe(true);
    expect(verdict.conditions.productEqualsU).toBe(false);
    expect(verdict.recovered).toBe(false);
    expect(verdict.mismatches.length).toBeGreaterThan(0);
  });

  it('a null X or Y is not recovery', () => {
    const session = sessionFor(INSTANCE_B);
    const verdict = verifyRecovery(publicView(session), session.aliceKey, null, null);
    expect(verdict.recovered).toBe(false);
    expect(verdict.candidateKey).toBeNull();
    expect(verdict.conditions.all).toBe(false);
  });
});

describe('the negative-claim bite fixture — a different Alice’s message', () => {
  const session = sessionFor(INSTANCE_B);
  // Keep A, B, Bob's V and the session key; swap in U' from a different Alice.
  const transcript: PublicTranscript = {
    a: INSTANCE_B.a,
    b: INSTANCE_B.b,
    u: MISMATCHED_MESSAGE.u,
    v: INSTANCE_B.expected.v,
  };

  it('U′ is what the brief states it is', () => {
    const other = runExchange({
      preset: byHand,
      a: INSTANCE_B.a,
      b: INSTANCE_B.b,
      p1: MISMATCHED_MESSAGE.p1,
      p2: MISMATCHED_MESSAGE.p2,
      q1: INSTANCE_B.q1,
      q2: INSTANCE_B.q2,
    });
    expect(other.transcript.u).toEqual(MISMATCHED_MESSAGE.u);
  });

  it('the heuristic fires on U′ at (2, 2) with c = 5', () => {
    const result = heuristicAttack(transcript, 3);
    expect(result.found).not.toBeNull();
    expect({ i: result.found!.i, j: result.found!.j, c: result.found!.c }).toEqual(
      MISMATCHED_MESSAGE.heuristic,
    );
  });

  it('it produces the brief’s matrix, which is NOT the session key', () => {
    const result = heuristicAttack(transcript, 3);
    const produced = keyFrom(result.found!.x, transcript.v, result.found!.y);
    expect(produced).toEqual(MISMATCHED_MESSAGE.producedKey);
    expect(matEq(produced, INSTANCE_B.expected.key)).toBe(false);
  });

  it('the verdict against the real session key is NOT recovered', () => {
    // This is the fixture that separates "the attack returned a matrix" from
    // "the attack recovered the key". A verdict set on the former would read
    // RECOVERED here, and be wrong.
    const result = heuristicAttack(transcript, 3);
    const verdict = verifyRecovery(
      transcript,
      session.aliceKey,
      result.found!.x,
      result.found!.y,
    );
    expect(verdict.recovered).toBe(false);
    expect(verdict.mismatches).toHaveLength(9);
    // Every break condition against U′ still holds — the attack did its job on
    // the message it was given. It is the KEY comparison that fails.
    expect(verdict.conditions.all).toBe(true);
  });
});

describe('mutation (3) — the heuristic without its constant', () => {
  it('leaving c out moves every entry of the key by exactly c', () => {
    // The brief: check B's key is then off by 3 in every entry. Asserted here
    // so the mutation's effect is a measurement, not a prediction.
    const session = sessionFor(INSTANCE_B);
    const transcript = publicView(session);
    const result = heuristicAttack(transcript, 3);
    const withoutScalar = keyFrom(matPow(INSTANCE_B.a, result.found!.i), transcript.v, result.found!.y);
    const offsets = new Set<number>();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) offsets.add(withoutScalar[i][j] - session.aliceKey[i][j]);
    }
    expect([...offsets]).toEqual([-3]);
    expect(result.found!.c).toBe(3);
  });
});

describe('power decay — why the heuristic works', () => {
  it('the maximum entry of A^⊗k falls as k grows', () => {
    const decay = powerDecay(PAPER_A, 5);
    expect(decay).toHaveLength(5);
    for (let i = 1; i < decay.length; i++) {
      expect(decay[i].max).toBeLessThan(decay[i - 1].max);
    }
  });

  it('by power 2 the gap already exceeds the designers’ coefficient range', () => {
    // The argument in one assertion: once consecutive powers are more than
    // 2,000 apart, a coefficient from [-1000, 1000] cannot make a lower-degree
    // term win the minimum.
    const session = runExchange({ preset: presetById('designers') });
    const decay = powerDecay(session.transcript.a, 4);
    expect(decay[1].max - decay[2].min).toBeGreaterThan(2000);
  });
});
