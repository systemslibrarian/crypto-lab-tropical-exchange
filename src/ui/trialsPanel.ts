/**
 * Exhibit 6 — many trials.
 *
 * N fresh instances per preset, attacked and checked, counted in a worker so
 * the page stays usable and the run stays cancellable.
 *
 * ── What the chart is, and is not ──
 * The comparison here is emphasis, not a categorical palette: the MEASURED
 * rate is the subject and the paper's published figure is context, so the bar
 * is the lab's one accent hue and the published value is a neutral reference
 * marker. No two data values ever have to be told apart by hue, which is the
 * only way a colour-blind reader could be left guessing.
 *
 * Every number rendered is counted. There is no extrapolation, no smoothing,
 * and no rate carried over from a previous run — change N or the preset and
 * the previous figures are retired rather than rescaled.
 */

import { PRESETS, type PresetId } from '../tropical/protocol.js';
import { formatRate, rate, type TrialCounts } from '../tropical/trials.js';
import type { WorkerRequest, WorkerResponse } from '../worker/trials.worker.js';
import { claim, clear, h, note, panelIntro, verdict } from './dom.js';

const TRIAL_CHOICES = [100, 250, 1000] as const;
const GENERAL_FRACTION = 0.2;

export function renderTrialsPanel(root: HTMLElement): void {
  clear(root);

  let worker: Worker | null = null;
  let requestId = 0;
  let running = false;
  const results = new Map<PresetId, { counts: TrialCounts; requested: number }>();
  let trialCount: number = TRIAL_CHOICES[0];

  root.append(
    panelIntro(
      'Many trials',
      'One instance proves nothing about a rate. This runs N fresh exchanges per parameter set, ' +
        'attacks each one, and compares every recovered key with the honest key entry by entry.',
      'The bars are what this browser just measured. The marker on each bar is what the paper ' +
        'reported over 100 instances in 2015. They are different measurements of the same thing, ' +
        'and they are kept visibly apart.',
    ),
  );

  const status = h('div', { class: 'trials-status', role: 'status', 'aria-live': 'polite' });
  const output = h('div', { class: 'trials-output' });

  // ── Controls ──────────────────────────────────────────────────────────
  const countGroup = h('div', {
    class: 'preset-row',
    role: 'group',
    'aria-label': 'Instances per parameter set',
  });
  for (const choice of TRIAL_CHOICES) {
    countGroup.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost preset-btn',
          'aria-pressed': choice === trialCount ? 'true' : 'false',
          onclick: () => {
            trialCount = choice;
            for (const button of countGroup.querySelectorAll('button')) {
              button.setAttribute('aria-pressed', String(button.textContent === String(choice)));
            }
            // Changing N retires every figure on screen: those counts were
            // measured against a different denominator.
            results.clear();
            draw();
          },
        },
        String(choice),
      ),
    );
  }

  const runButton = h(
    'button',
    { type: 'button', class: 'btn btn-primary', id: 'run-trials' },
    'Run the trials',
  );
  const stopButton = h(
    'button',
    { type: 'button', class: 'btn btn-ghost', id: 'stop-trials', disabled: true },
    'Stop',
  );

  runButton.addEventListener('click', () => void runAll());
  stopButton.addEventListener('click', () => {
    worker?.postMessage({ kind: 'cancel' } satisfies WorkerRequest);
  });

  root.append(
    h(
      'div',
      { class: 'controls' },
      h(
        'div',
        { class: 'control' },
        h('span', { class: 'control-label' }, 'Instances per parameter set'),
        countGroup,
        h(
          'p',
          { class: 'help' },
          `The general attack runs on the first ${Math.round(GENERAL_FRACTION * 100)}% of each ` +
            'batch — it does more work per instance, and the paper reports 100% for it at every ' +
            'parameter set, so a smaller sample settles the question.',
        ),
      ),
      h('div', { class: 'input-row' }, runButton, stopButton),
    ),
    status,
    output,
  );

  async function runAll(): Promise<void> {
    if (running) return;
    running = true;
    runButton.disabled = true;
    stopButton.disabled = false;
    results.clear();
    draw();

    worker ??= new Worker(new URL('../worker/trials.worker.ts', import.meta.url), {
      type: 'module',
    });

    for (const preset of PRESETS) {
      if (preset.id === 'by-hand') continue; // no published rate to compare against
      const id = ++requestId;
      clear(status);
      status.append(h('p', {}, `Running ${trialCount} instances at ${preset.label}…`));
      await new Promise<void>((resolve) => {
        const onMessage = (event: MessageEvent<WorkerResponse>): void => {
          const message = event.data;
          if (!('id' in message) || message.id !== id) return;
          if (message.kind === 'trial-progress') {
            results.set(preset.id, { counts: message.counts, requested: trialCount });
            draw();
            return;
          }
          if (message.kind === 'trial-done') {
            results.set(preset.id, { counts: message.counts, requested: trialCount });
            draw();
            worker?.removeEventListener('message', onMessage);
            resolve();
            return;
          }
          if (message.kind === 'error') {
            clear(status);
            status.append(
              verdict('trials-error', 'fail', `The trial runner failed: ${message.message}`),
            );
            worker?.removeEventListener('message', onMessage);
            resolve();
          }
        };
        worker?.addEventListener('message', onMessage);
        worker?.postMessage({
          kind: 'run-trials',
          id,
          preset: preset.id,
          trials: trialCount,
          generalTrials: Math.max(1, Math.round(trialCount * GENERAL_FRACTION)),
        } satisfies WorkerRequest);
      });
    }

    clear(status);
    running = false;
    runButton.disabled = false;
    stopButton.disabled = true;
    draw();
  }

  function draw(): void {
    clear(output);

    if (results.size === 0) {
      output.append(
        verdict(
          'trials-outcome',
          'pending',
          'NOT RUN YET — no instance has been generated, so there is nothing to report',
        ),
      );
      output.append(
        note(
          'info',
          'Nothing on this panel is precomputed. Press the button and every number below is ' +
            'counted from exchanges this browser generates and attacks while you watch.',
        ),
      );
      return;
    }

    const list = h('ul', { class: 'rate-list', role: 'list' });
    let totalCompleted = 0;
    let totalWrong = 0;

    for (const preset of PRESETS) {
      if (preset.id === 'by-hand') continue;
      const entry = results.get(preset.id);
      if (!entry) continue;
      const { counts } = entry;
      totalCompleted += counts.completed;
      totalWrong += counts.heuristicWrongKey;
      const measured = rate(counts.heuristicRecovered, counts.completed);
      const published = preset.publishedHeuristicRate;

      const track = h('div', { class: 'rate-track' });
      track.append(h('div', { class: 'rate-fill', style: `width:${measured ?? 0}%` }));
      if (published !== null) {
        track.append(
          h('div', {
            class: 'rate-reference',
            style: `left:calc(${published}% - 1px)`,
            'aria-hidden': 'true',
          }),
        );
      }

      list.append(
        h(
          'li',
          { class: 'rate-row', role: 'listitem' },
          h(
            'div',
            { class: 'rate-head' },
            h('span', { class: 'rate-name' }, preset.label),
            h(
              'span',
              { class: 'rate-values' },
              'measured ',
              claim(
                `trials-measured-${preset.id}`,
                `${counts.heuristicRecovered} of ${counts.completed} (${formatRate(measured)})`,
                `${counts.heuristicRecovered}/${counts.completed}`,
              ),
              published === null ? '' : ` · paper ${published}%`,
            ),
          ),
          track,
          h(
            'p',
            { class: 'rate-note' },
            `The bar is this run. The vertical marker is the paper's ${published}% over 100 instances ` +
              'on 2015 hardware. The general attack recovered ',
            claim(
              `trials-general-${preset.id}`,
              `${counts.generalRecovered} of ${counts.generalAttempted}`,
              `${counts.generalRecovered}/${counts.generalAttempted}`,
            ),
            ' (the paper reports 100%).',
          ),
        ),
      );
    }
    output.append(list);

    // ── The counts, as a table — the chart's WCAG-clean twin ─────────────
    const table = h('table', { class: 'counts-table' });
    table.append(
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'parameter set'),
          h('th', { scope: 'col' }, 'instances'),
          h('th', { scope: 'col' }, 'heuristic: key recovered'),
          h('th', { scope: 'col' }, 'heuristic: found nothing'),
          h('th', { scope: 'col' }, 'heuristic: wrong key'),
          h('th', { scope: 'col' }, 'general: attempted'),
          h('th', { scope: 'col' }, 'general: key recovered'),
        ),
      ),
    );
    const tbody = h('tbody');
    for (const preset of PRESETS) {
      if (preset.id === 'by-hand') continue;
      const entry = results.get(preset.id);
      if (!entry) continue;
      const c = entry.counts;
      tbody.append(
        h(
          'tr',
          {},
          h('th', { scope: 'row' }, preset.label),
          h('td', { class: 'num' }, String(c.completed)),
          h('td', { class: 'num' }, String(c.heuristicRecovered)),
          h('td', { class: 'num' }, String(c.heuristicFoundNothing)),
          h('td', { class: 'num' }, String(c.heuristicWrongKey)),
          h('td', { class: 'num' }, String(c.generalAttempted)),
          h('td', { class: 'num' }, String(c.generalRecovered)),
        ),
      );
    }
    table.append(tbody);
    output.append(
      h(
        'div',
        {
          class: 'table-wrap',
          tabindex: '0',
          role: 'region',
          'aria-label': 'Trial counts per parameter set',
        },
        table,
      ),
    );

    // ── The verdict ───────────────────────────────────────────────────────
    const anyDone = [...results.values()].some((r) => r.counts.completed >= r.requested);
    output.append(
      totalWrong > 0
        ? verdict(
            'trials-outcome',
            'fail',
            `WRONG KEY RETURNED ${totalWrong} time${totalWrong === 1 ? '' : 's'} — the heuristic is ` +
              'supposed to find the key or find nothing, so this is worth investigating',
          )
        : verdict(
            'trials-outcome',
            anyDone && !running ? 'alarm' : 'pending',
            running
              ? `RUNNING — ${totalCompleted} instances counted so far`
              : `${totalCompleted} INSTANCES COUNTED — every recovered key matched the honest key ` +
                'entry by entry, and the heuristic never returned a wrong one',
          ),
    );

    output.append(
      h(
        'p',
        { class: 'help' },
        'Instances counted in this run: ',
        claim('trials-total', String(totalCompleted), String(totalCompleted)),
        '. Every one of them is a fresh A, B, four fresh polynomials, two keys computed ' +
          'independently and compared.',
      ),
    );

    output.append(
      note(
        'caveat',
        'The paper’s timings are not comparable with anything here — different hardware, a ' +
          'different language, eleven years. The success RATES are comparable, and those are what ' +
          'the markers show.',
      ),
    );
  }

  draw();
}
