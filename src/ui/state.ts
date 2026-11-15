/**
 * The one session every panel reads.
 *
 * Exhibits 2 through 5 are four views of the SAME instance: generate once, and
 * the exchange, the heuristic, the failure case and the general attack all
 * speak about the same A, B, U, V. That is what makes exhibit 4's "the scan
 * finds nothing" and exhibit 5's "and here is the key anyway" land as two
 * statements about one object rather than two unrelated demos.
 *
 * Changing the preset or editing an input retires every verdict downstream:
 * a verdict on screen must belong to the controls currently on screen.
 */

import { presetById, runExchange, type PresetId, type Session } from '../tropical/protocol.js';
import { INSTANCE_B } from '../tropical/fixtures.js';

type Listener = (state: LabState) => void;

export interface LabState {
  readonly presetId: PresetId;
  readonly session: Session;
  /** Bumped on every regeneration, so a panel can tell a stale render apart. */
  readonly generation: number;
}

let listeners: Listener[] = [];
let state: LabState = {
  presetId: 'by-hand',
  session: freshByHandSession(),
  generation: 0,
};

/**
 * The arrival instance is the brief's check B, not a random draw.
 *
 * A page that generates randomly at mount has a different first paint on every
 * visit, which makes the worked example in the README unreproducible and makes
 * the claims suite assert a moving target. The learner presses Generate to get
 * a fresh one; what they arrive at is the instance the tests and the README
 * both describe.
 */
function freshByHandSession(): Session {
  return runExchange({
    preset: presetById('by-hand'),
    a: INSTANCE_B.a,
    b: INSTANCE_B.b,
    p1: INSTANCE_B.p1,
    p2: INSTANCE_B.p2,
    q1: INSTANCE_B.q1,
    q2: INSTANCE_B.q2,
  });
}

export function getState(): LabState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function publish(): void {
  for (const listener of listeners) listener(state);
}

/** Generate a fresh instance at the current preset, or at a new one. */
export function regenerate(presetId: PresetId = state.presetId): void {
  const preset = presetById(presetId);
  state = {
    presetId,
    session: runExchange({ preset }),
    generation: state.generation + 1,
  };
  publish();
}

/** Replace the session with a specific one — the by-hand panel's editor. */
export function setSession(session: Session, presetId: PresetId): void {
  state = { presetId, session, generation: state.generation + 1 };
  publish();
}

/** Return to the worked instance the page arrives at. */
export function resetToWorkedInstance(): void {
  state = { presetId: 'by-hand', session: freshByHandSession(), generation: state.generation + 1 };
  publish();
}
