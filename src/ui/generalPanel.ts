/**
 * Exhibit 5 — the general attack.
 *
 * Shown as the three things it actually is: a set of terms with their minima,
 * a choice of cover, and a system of difference constraints that the cover
 * either makes consistent or does not. The learner sees which cells each
 * chosen term covers, the x and y the solver returned, X ⊗ Y checked against
 * U, and the recovered key compared with the real one.
 *
 * The panel also makes the point the break condition is really about: the X it
 * finds is NOT Alice's p₁(A), and the key comes out anyway.
 */

import { generalAttack, type GeneralResult } from '../tropical/general.js';
import { verifyRecovery } from '../tropical/heuristic.js';
import { presetById } from '../tropical/protocol.js';
import { diffCells, formatEntry, matEq } from '../tropical/tropical.js';
import { claim, clear, h, learnerCheck, matrixTable, note, panelIntro, verdict } from './dom.js';
import { getState, subscribe } from './state.js';

export function renderGeneralPanel(root: HTMLElement): void {
  const render = (): void => {
    const { presetId, session } = getState();
    const preset = presetById(presetId);
    const transcript = session.transcript;
    const result = generalAttack(transcript, preset.degreeHi);
    clear(root);

    root.append(
      panelIntro(
        'The general attack',
        'This one does not care how the parameters were chosen. Instead of hoping one term ' +
          'dominates, it solves for all of them at once.',
        'Look for X = ⊕ xᵢ ⊗ A^⊗ⁱ and Y = ⊕ yⱼ ⊗ B^⊗ʲ. Any such pair commutes with A and B for ' +
          'free, so the only thing left to satisfy is X ⊗ Y = U. Written out cell by cell that ' +
          'becomes a system: every term must sit at or above zero, and every cell must be reached ' +
          'by at least one term sitting exactly at zero.',
      ),
    );

    root.append(
      h(
        'div',
        { class: 'view-card is-public' },
        h('span', { class: 'view-tag' }, 'THE EAVESDROPPER’S VIEW'),
        h('p', {}, 'A, B, U and V. The same four matrices as the previous exhibit.'),
      ),
    );

    if (result.status !== 'solved') {
      root.append(
        result.status === 'budget-exhausted'
          ? verdict(
              'general-outcome',
              'fail',
              `NOT RECOVERED WITHIN BUDGET — ${result.coversTested} covers tested against a budget of ${result.budget}`,
            )
          : verdict(
              'general-outcome',
              'fail',
              'NO SOLUTION — no cover makes the equalities and inequalities consistent, so no X and Y ' +
                'of this form exist for this U',
            ),
      );
      root.append(
        note(
          'caveat',
          'This is a real outcome, not an error. If U has been edited by hand so that no X ⊗ Y ' +
            'reproduces it, the honest answer is that the system has no solution — and the page ' +
            'shows no key.',
        ),
      );
      root.append(renderSystemExplainer(result, preset.n));
      render_learnerCheck(root);
      return;
    }

    const recovery = verifyRecovery(transcript, session.aliceKey, result.xMatrix, result.yMatrix);
    const mismatches = diffCells(recovery.candidateKey!, session.aliceKey);

    // ── The cover ─────────────────────────────────────────────────────────
    root.append(h('h3', {}, 'The cover it chose'));
    root.append(
      h(
        'p',
        {},
        'Terms forced to equality: ',
        claim('general-cover-size', String(result.cover.length), String(result.cover.length)),
        ' of ',
        claim(
          'general-term-count',
          String(result.terms.length),
          String(result.terms.length),
        ),
        '. Complete covers tested before one worked: ',
        claim('general-covers-tested', String(result.coversTested), String(result.coversTested)),
        ` (budget ${result.budget}).`,
      ),
    );

    const coverList = h('ul', { class: 'cover-list', role: 'list' });
    for (const term of result.cover) {
      const data = result.terms.find((t) => t.i === term.i && t.j === term.j)!;
      coverList.append(
        h(
          'li',
          { class: 'cover-item', role: 'listitem' },
          h('code', {}, `(i, j) = (${term.i}, ${term.j})`),
          ` — minimum ${formatEntry(data.m)}, attained in ${data.cells.length} ` +
            `cell${data.cells.length === 1 ? '' : 's'}`,
        ),
      );
    }
    root.append(coverList);

    // Which cells of the grid each chosen term covers, drawn on the grid.
    const coverMap = new Map<number, string>();
    for (const [index, term] of result.cover.entries()) {
      const data = result.terms.find((t) => t.i === term.i && t.j === term.j)!;
      for (const cell of data.cells) {
        if (!coverMap.has(cell)) coverMap.set(cell, String(index + 1));
      }
    }
    root.append(
      matrixTable(transcript.u, {
        caption: 'Which chosen term reaches each cell of U',
        compact: preset.n > 3,
        cellClass: (i, j) => (coverMap.has(i * preset.n + j) ? 'cell-cover' : undefined),
        cellMark: (i, j) => coverMap.get(i * preset.n + j),
        markDescription:
          'The small number is which term in the list above reaches that cell. Every cell must ' +
          'carry one, or the product would sit strictly above U somewhere.',
      }),
    );

    // ── The solution ──────────────────────────────────────────────────────
    root.append(h('h3', {}, 'The coefficients it solved for'));
    root.append(
      h('p', { class: 'field-value' }, `x = (${result.x!.map(formatEntry).join(', ')})`),
      h('p', { class: 'field-value' }, `y = (${result.y!.map(formatEntry).join(', ')})`),
      h(
        'p',
        { class: 'help' },
        'Integers, from a shortest-path computation rather than a linear-programming solver — see ' +
          'the note below.',
      ),
    );

    root.append(
      h(
        'ul',
        { class: 'conditions', role: 'list' },
        conditionRow('X ⊗ A = A ⊗ X', recovery.conditions.xCommutesWithA),
        conditionRow('Y ⊗ B = B ⊗ Y', recovery.conditions.yCommutesWithB),
        conditionRow('X ⊗ Y = U', recovery.conditions.productEqualsU),
      ),
    );

    // ── The key ───────────────────────────────────────────────────────────
    root.append(h('h3', {}, 'The key'));
    root.append(
      h(
        'div',
        { class: 'matrix-pair' },
        matrixTable(recovery.candidateKey!, {
          caption: 'X ⊗ V ⊗ Y — what the eavesdropper computed',
          compact: preset.n > 3,
          cellClass: (i, j) =>
            mismatches.some((m) => m.i === i && m.j === j) ? 'cell-differ' : 'cell-match',
          cellMark: (i, j) => (mismatches.some((m) => m.i === i && m.j === j) ? '✕' : '✓'),
          markDescription:
            'A ✓ marks a cell equal to the honest key and a ✕ one that differs.',
        }),
        matrixTable(session.aliceKey, {
          caption: 'The key Alice and Bob share',
          compact: preset.n > 3,
        }),
      ),
    );

    const cells = preset.n * preset.n;
    root.append(
      recovery.recovered
        ? verdict(
            'general-outcome',
            'alarm',
            `KEY RECOVERED — all ${cells} entries match the shared key, compared one at a time`,
          )
        : verdict(
            'general-outcome',
            'fail',
            `KEY NOT RECOVERED — ${recovery.mismatches.length} of ${cells} entries differ from the shared key`,
          ),
    );

    // ── X is not Alice's secret ───────────────────────────────────────────
    const matchesAlice = matEq(result.xMatrix!, session.alice.firstEvaluated);
    root.append(h('h3', {}, 'And X is not Alice’s p₁(A)'));
    root.append(
      h(
        'div',
        { class: 'matrix-pair' },
        matrixTable(result.xMatrix!, { caption: 'X, found by the attack', compact: preset.n > 3 }),
        matrixTable(session.alice.firstEvaluated, {
          caption: 'p₁(A), Alice’s actual secret',
          compact: preset.n > 3,
        }),
      ),
    );
    root.append(
      matchesAlice
        ? verdict(
            'general-x-distinct',
            'pending',
            'On this instance X happens to equal p₁(A) — the attack does not aim for it, and ' +
              'usually lands elsewhere',
          )
        : verdict(
            'general-x-distinct',
            'alarm',
            'X ≠ p₁(A) — the attacker never recovers Alice’s secret, and never needs to',
          ),
    );
    root.append(
      h(
        'p',
        { class: 'help' },
        'That is the shape of the break condition: any X and Y commuting with A and B whose ' +
          'product is U will do. The secrets are not the target; a working substitute for them is.',
      ),
    );

    root.append(renderSystemExplainer(result, preset.n));
    render_learnerCheck(root);
  };

  render();
  subscribe(render);
}

function conditionRow(label: string, holds: boolean): HTMLElement {
  return h(
    'li',
    { class: 'condition', role: 'listitem' },
    h(
      'span',
      { class: `pill pill-${holds ? 'ok' : 'bad'}` },
      h('span', { 'aria-hidden': 'true' }, holds ? '✓ ' : '✕ '),
      holds ? 'holds' : 'fails',
    ),
    ' ',
    h('code', {}, label),
  );
}

/** Progressive disclosure: the system, and how it gets decided. */
function renderSystemExplainer(result: GeneralResult, n: number): HTMLElement {
  const details = h('details', { class: 'disclosure' });
  details.append(h('summary', {}, 'How the system is solved'));
  const body = h('div', { class: 'disclosure-body' });
  body.append(
    h(
      'p',
      {},
      'With Tⁱʲ = A^⊗ⁱ ⊗ B^⊗ʲ − U and mᵢⱼ its smallest entry, X ⊗ Y = U holds exactly when ' +
        'xᵢ + yⱼ ≥ −mᵢⱼ for every pair, and the pairs where equality holds reach every cell ' +
        `of the ${n}×${n} grid between them.`,
    ),
    h(
      'p',
      {},
      'Substituting wⱼ = −yⱼ turns every one of those into a difference constraint: ' +
        'wⱼ − xᵢ ≤ mᵢⱼ, and xᵢ − wⱼ ≤ −mᵢⱼ on the cover. A system of difference constraints is ' +
        'a shortest-path problem — feasible exactly when the graph has no negative cycle, and the ' +
        'distances themselves are a solution, in integers. The paper reaches for the simplex ' +
        'method; this needs ' +
        `${result.terms.length > 0 ? 2 * Math.round(Math.sqrt(result.terms.length)) : 0} nodes and no solver library.`,
    ),
    h(
      'p',
      {},
      'Enumerating covers is set cover, which is hard in general — the paper says so explicitly. ' +
        'It was easy on every random instance the paper tried, and it is easy here. That is an ' +
        'observation about these instances, not a claim that the attack is polynomial-time.',
    ),
  );
  details.append(body);
  return details;
}

function render_learnerCheck(root: HTMLElement): void {
  root.append(
    learnerCheck(
      'The general attack succeeded where the heuristic failed. What made the difference?',
      [
        {
          label: 'It solves for every coefficient at once instead of hoping one term dominates',
          correct: true,
        },
        { label: 'It tries more values of i and j', correct: false },
        { label: 'It uses the secret polynomials', correct: false },
      ],
      'The first. The heuristic needs the polynomial to collapse to a single term; the general ' +
        'attack never assumes that, and solves the whole system instead. Neither attack ever sees ' +
        'a secret — both take only A, B, U and V.',
    ),
  );
}
