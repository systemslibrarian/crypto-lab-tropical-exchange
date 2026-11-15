/**
 * Exhibit 4 — where the heuristic stops working.
 *
 * The honest half of the lab. One attack failing is not the protocol holding,
 * and this panel exists so that distinction is something the learner DOES
 * rather than reads: switch to all-non-negative entries, watch the same scan
 * come up empty on every pair, and then be told plainly that this says nothing
 * about the protocol's security — the next exhibit breaks it anyway.
 *
 * The mechanism is visible in the numbers: with non-negative entries the
 * powers of A climb instead of falling, so no single term dominates and the
 * polynomial does not collapse.
 */

import { heuristicAttack, powerDecay } from '../tropical/heuristic.js';
import { generalAttack } from '../tropical/general.js';
import { presetById, publicView, runExchange } from '../tropical/protocol.js';
import { formatEntry } from '../tropical/tropical.js';
import { claim, clear, h, learnerCheck, note, panelIntro, verdict } from './dom.js';

export function renderLimitsPanel(root: HTMLElement): void {
  clear(root);

  root.append(
    panelIntro(
      'Where the heuristic stops working',
      'The one-line attack rests on one thing: powers of A falling away fast enough that the ' +
        'coefficients cannot matter. Take that away and it finds nothing.',
      'The paper measures this. With entries and coefficients drawn from [-10³, 10³] and ' +
        '[-10¹⁰, 10¹⁰] the heuristic works 97 times in 100. Make every entry non-negative and it ' +
        'drops to 2.',
    ),
  );

  // ── The mechanism: powers climbing instead of falling ──────────────────
  const negativeSession = runExchange({ preset: presetById('designers') });
  const nonNegativeSession = runExchange({ preset: presetById('non-negative') });

  root.append(h('h3', {}, 'Why: look at what the powers do'));

  const comparison = h('table', { class: 'counts-table' });
  comparison.append(
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, 'power'),
        h('th', { scope: 'col' }, 'largest entry, mixed signs'),
        h('th', { scope: 'col' }, 'largest entry, all non-negative'),
      ),
    ),
  );
  const mixed = powerDecay(negativeSession.transcript.a, 5);
  const nonNegative = powerDecay(nonNegativeSession.transcript.a, 5);
  const tbody = h('tbody');
  for (let index = 0; index < mixed.length; index++) {
    tbody.append(
      h(
        'tr',
        {},
        h('th', { scope: 'row' }, `A^⊗${mixed[index].power}`),
        h('td', { class: 'num' }, formatEntry(mixed[index].max)),
        h('td', { class: 'num' }, formatEntry(nonNegative[index].max)),
      ),
    );
  }
  comparison.append(tbody);
  root.append(
    h(
      'div',
      {
        class: 'table-wrap',
        tabindex: '0',
        role: 'region',
        'aria-label': 'Largest entry per power, mixed signs against all non-negative',
      },
      comparison,
    ),
  );
  root.append(
    h(
      'p',
      { class: 'help' },
      'With mixed signs the entries run away downward and each power leaves the last one far ' +
        'behind. With every entry non-negative the minimum has nothing negative to reach for, so ' +
        'the powers barely move and the coefficients stay in the race.',
    ),
  );

  // ── The scan, run for real on a non-negative instance ──────────────────
  root.append(h('h3', {}, 'The same scan, on non-negative parameters'));

  const transcript = publicView(nonNegativeSession);
  const preset = presetById('non-negative');
  const result = heuristicAttack(transcript, preset.degreeHi, { collectSteps: true });
  const best = result.steps.reduce(
    (acc, step) => (step.matching > acc.matching ? step : acc),
    result.steps[0],
  );

  root.append(
    h(
      'p',
      {},
      'Pairs tried: ',
      claim('limits-pairs-tried', String(result.tried), String(result.tried)),
      '. Best any pair managed: ',
      claim(
        'limits-best-match',
        `${best.matching} of ${best.cells} cells equal`,
        `${best.matching}/${best.cells}`,
      ),
      `, at i = ${best.i}, j = ${best.j}.`,
    ),
  );

  root.append(
    result.found === null
      ? verdict(
          'limits-outcome',
          'fail',
          `HEURISTIC FOUND NOTHING — all ${result.tried} pairs scanned, no constant difference`,
        )
      : verdict(
          'limits-outcome',
          'alarm',
          `This draw happened to fall to the heuristic at i = ${result.found.i}, j = ${result.found.j} — ` +
            'about one in fifty do. Reload to see the usual outcome.',
        ),
  );

  root.append(
    note(
      'caveat',
      'Read that verdict carefully. It says one attack did not apply. It does not say the key is ' +
        'safe, and it is not evidence that anything is hard — only that this particular shortcut ' +
        'needs a structure these parameters do not have.',
    ),
  );

  // ── And the general attack takes it anyway ─────────────────────────────
  const general = generalAttack(transcript, preset.degreeHi);
  root.append(
    h(
      'p',
      {},
      'On this very instance, the general attack in the next exhibit ',
      general.status === 'solved'
        ? 'recovers the key.'
        : `reported ${general.status}, which is worth investigating.`,
    ),
  );
  root.append(
    general.status === 'solved'
      ? verdict(
          'limits-general-outcome',
          'alarm',
          'AND THE GENERAL ATTACK SOLVES IT — the same instance, broken by the next exhibit',
        )
      : verdict(
          'limits-general-outcome',
          'fail',
          `The general attack reported ${general.status} on this instance`,
        ),
  );

  root.append(
    learnerCheck(
      'The scan came up empty on all 100 pairs. What follows?',
      [
        { label: 'That this attack does not apply to this instance', correct: true },
        { label: 'That the shared key is secure', correct: false },
        { label: 'That no known algorithm can recover the key', correct: false },
      ],
      'Only the first. An attack failing is a fact about the attack. The paper that published ' +
        'this heuristic published a second attack in the same six pages, and that one succeeded ' +
        'on every instance it was given — including, as you just saw, this one.',
    ),
  );

  root.append(
    note(
      'info',
      'This is the lesson the lab exists for. "No known algorithm solves these systems" was the ' +
        'security argument for this platform. It was an argument about a general problem, and the ' +
        'key generator does not produce general instances — it produces a narrow, structured ' +
        'family, and that family had an algorithm.',
    ),
  );
}
