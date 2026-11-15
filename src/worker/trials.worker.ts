/**
 * The trial runner and the general attack, off the main thread.
 *
 * Both are cheap per instance — a few milliseconds — but a thousand of them is
 * seconds of solid arithmetic, and on the main thread that is a frozen page:
 * no scrolling, no cancelling, no focus ring moving. So they run here.
 *
 * Cancellation is cooperative and checked BETWEEN instances rather than inside
 * one: an instance is the unit that produces a counted result, and stopping
 * mid-instance would leave a trial half-counted. `runTrials` takes a
 * `shouldStop` callback for exactly this.
 *
 * Progress is posted on a time budget rather than per instance. Posting 1,000
 * messages floods the main thread with structured clones and makes the page
 * less responsive than not using a worker at all.
 */

import { generalAttack } from '../tropical/general.js';
import { presetById, type PresetId } from '../tropical/protocol.js';
import { runTrials, type TrialCounts } from '../tropical/trials.js';
import type { Matrix } from '../tropical/tropical.js';

export interface RunTrialsRequest {
  readonly kind: 'run-trials';
  readonly id: number;
  readonly preset: PresetId;
  readonly trials: number;
  readonly generalTrials: number;
}

export interface GeneralAttackRequest {
  readonly kind: 'general-attack';
  readonly id: number;
  readonly transcript: { a: Matrix; b: Matrix; u: Matrix; v: Matrix };
  readonly maxDegree: number;
}

export interface CancelRequest {
  readonly kind: 'cancel';
}

export type WorkerRequest = RunTrialsRequest | GeneralAttackRequest | CancelRequest;

export type WorkerResponse =
  | { kind: 'trial-progress'; id: number; counts: TrialCounts }
  | { kind: 'trial-done'; id: number; counts: TrialCounts; cancelled: boolean }
  | { kind: 'general-done'; id: number; result: ReturnType<typeof generalAttack> }
  | { kind: 'error'; id: number; message: string };

let cancelled = false;

/** How often progress is posted, in milliseconds. */
const PROGRESS_INTERVAL_MS = 120;

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.kind === 'cancel') {
    cancelled = true;
    return;
  }

  cancelled = false;

  try {
    if (request.kind === 'run-trials') {
      let lastPost = 0;
      const counts = runTrials({
        preset: presetById(request.preset),
        trials: request.trials,
        generalTrials: request.generalTrials,
        shouldStop: () => cancelled,
        onProgress: (progress) => {
          const now = Date.now();
          if (now - lastPost < PROGRESS_INTERVAL_MS) return;
          lastPost = now;
          post({ kind: 'trial-progress', id: request.id, counts: progress });
        },
      });
      post({ kind: 'trial-done', id: request.id, counts, cancelled });
      return;
    }

    if (request.kind === 'general-attack') {
      const result = generalAttack(request.transcript, request.maxDegree);
      post({ kind: 'general-done', id: request.id, result });
      return;
    }
  } catch (error) {
    // A throw inside a worker is otherwise an "uncaught error in worker" with
    // no route back to the page, which renders as a panel that never arrives.
    post({
      kind: 'error',
      id: (request as { id?: number }).id ?? -1,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}
