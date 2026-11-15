/**
 * Exhibit 3 — the heuristic, stepped.
 *
 * THE HEADLINE MECHANISM OF THE WHOLE LAB IS HERE, and it is shown rather
 * than asserted: the learner steps the scan through (i, j), watches the
 * difference matrix U − A^⊗i ⊗ B^⊗j redraw each time, sees most of them be a
 * jumble, and sees one of them come out as the same number in every cell. That
 * single frame is the attack.
 *
 * Matching cells are marked three ways — a ✓ glyph, a border and a fill — so
 * the mark survives greyscale and every form of colour blindness.
 *
 * ── The negative claim lives on this panel (§4.1d) ──
 * Every check the honest parties can make passes here: the keys agree, the
 * messages are well-formed, A and B do not commute. And the eavesdropper has
 * the key anyway. The verdict reads as success and failure at once.
 */

import { heuristicAttack, keyFrom, verifyRecovery, type ScanStep } from '../tropical/heuristic.js';
import { presetById } from '../tropical/protocol.js';
import { diffCells, formatEntry, matEq } from '../tropical/tropical.js';
import { MISMATCHED_MESSAGE, INSTANCE_B } from '../tropical/fixtures.js';
import { claim, clear, h, learnerCheck, matrixTable, note, panelIntro, verdict } from './dom.js';
import { getState, subscribe } from './state.js';

/** The negative claim, scoped to the instance on the page. §4.1d. */
export const NEGATIVE_CLAIM =
  'Both parties computing the same key says nothing about who else can compute it: for this ' +
  'instance an eavesdropper who saw only A, B, U and V has the same key.';

export function renderHeuristicPanel(root: HTMLElement): void {
  const render = (): void => {
    const { presetId, session } = getState();
    const preset = presetById(presetId);
    const transcript = session.transcript;
    const result = heuristicAttack(transcript, preset.degreeHi);
    clear(root);

    root.append(
      panelIntro(
        'The heuristic attack',
        'An eavesdropper has four matrices: A, B, and the two messages U and V. Nothing else. ' +
          'The attack below is one line of reasoning long.',
        'Powers of a random matrix fall away fast. So in p₁(A) = ⊕ cᵢ ⊗ A^⊗ⁱ the highest power is ' +
          'usually so far below the rest that the coefficients cannot matter, and the whole ' +
          'polynomial collapses to a single term. If that happens for both Alice’s ' +
          'polynomials, her message U is just c ⊗ A^⊗ⁱ ⊗ B^⊗ʲ for some i, j and some single ' +
          'number c — and you can find them by trying each pair and subtracting.',
      ),
    );

    root.append(
      h(
        'div',
        { class: 'view-card is-public' },
        h('span', { class: 'view-tag' }, 'THE EAVESDROPPER’S VIEW'),
        h(
          'p',
          {},
          'Everything below is computed from A, B, U and V alone. The attack function takes a ' +
            'transcript object that has no field for a secret, so there is no way for one to ' +
            'reach it.',
        ),
      ),
    );

    // ── The scan, stepped ─────────────────────────────────────────────────
    const steps = result.steps;
    let cursor = result.found
      ? steps.findIndex((s) => s.constant)
      : 0;

    const scanGrid = h('div', {
      class: 'scan-grid',
      role: 'group',
      'aria-label': `Scan over ${steps.length} pairs`,
    });
    const stepOut = h('div', { class: 'step-out' });
    const progress = h('span', { class: 'step-progress' });

    const drawStep = (): void => {
      const step = steps[cursor];
      clear(stepOut);
      progress.replaceChildren(
        document.createTextNode(`Pair ${cursor + 1} / ${steps.length}`),
      );

      for (const [index, cell] of Array.from(scanGrid.children).entries()) {
        cell.classList.toggle('scan-current', index === cursor);
      }

      stepOut.append(
        matrixTable(step.difference, {
          caption: `U − (A^⊗${step.i} ⊗ B^⊗${step.j})`,
          compact: preset.n > 3,
          cellClass: (_i, _j, value) => (value === step.candidate ? 'cell-match' : undefined),
          cellMark: (_i, _j, value) => (value === step.candidate ? '✓' : undefined),
          markDescription:
            `A ✓ and a highlighted border mark every cell equal to ${formatEntry(step.candidate)}, ` +
            'the value in the first cell. The attack fires only when every cell carries one.',
        }),
        h(
          'p',
          { class: 'help' },
          'Cells equal to the first one: ',
          claim(
            'scan-matching-cells',
            `${step.matching} of ${step.cells}`,
            `${step.matching}/${step.cells}`,
          ),
          '.',
        ),
        step.constant
          ? verdict(
              'scan-step',
              'alarm',
              `CONSTANT — every entry is ${formatEntry(step.candidate)}, so U = ${formatEntry(step.candidate)} ⊗ A^⊗${step.i} ⊗ B^⊗${step.j}`,
            )
          : verdict(
              'scan-step',
              'pending',
              `Not constant — ${step.matching} of ${step.cells} entries match, so this pair says nothing`,
            ),
      );
    };

    for (const [index, step] of steps.entries()) {
      scanGrid.append(
        h(
          'button',
          {
            type: 'button',
            class: step.constant ? 'scan-cell scan-hit' : 'scan-cell',
            'aria-label': `Pair i equals ${step.i}, j equals ${step.j}${step.constant ? ', constant difference found' : ''}`,
            onclick: () => {
              cursor = index;
              drawStep();
            },
          },
          `${step.i},${step.j}${step.constant ? ' ✓' : ''}`,
        ),
      );
    }

    root.append(
      h('h3', {}, 'Try every pair (i, j)'),
      h(
        'div',
        { class: 'step-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost',
            id: 'scan-prev',
            onclick: () => {
              cursor = (cursor - 1 + steps.length) % steps.length;
              drawStep();
            },
          },
          '‹ Previous pair',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost',
            id: 'scan-next',
            onclick: () => {
              cursor = (cursor + 1) % steps.length;
              drawStep();
            },
          },
          'Next pair ›',
        ),
        progress,
      ),
      scanGrid,
      stepOut,
    );
    drawStep();

    // ── The outcome ───────────────────────────────────────────────────────
    root.append(h('h3', {}, 'What the scan found'));

    if (result.found === null) {
      root.append(
        verdict(
          'heuristic-outcome',
          'fail',
          `HEURISTIC FOUND NOTHING — no pair in 1..${preset.degreeHi} gave a constant difference`,
        ),
        note(
          'caveat',
          'Found nothing is not the same as secure. It means this one-line attack does not apply ' +
            'to this instance. The general attack, two exhibits along, recovers the key anyway.',
        ),
      );
    } else {
      const found = result.found;
      const recovery = verifyRecovery(transcript, session.aliceKey, found.x, found.y);
      const mismatches = diffCells(recovery.candidateKey!, session.aliceKey);

      root.append(
        h(
          'p',
          {},
          'Hit at i = ',
          claim('heuristic-i', String(found.i), String(found.i)),
          ', j = ',
          claim('heuristic-j', String(found.j), String(found.j)),
          ', c = ',
          claim('heuristic-c', formatEntry(found.c), String(found.c)),
          '. So X = c ⊗ A^⊗ⁱ and Y = B^⊗ʲ.',
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

      root.append(
        h(
          'div',
          { class: 'matrix-pair' },
          matrixTable(recovery.candidateKey!, {
            caption: 'X ⊗ V ⊗ Y — what the eavesdropper computed',
            compact: preset.n > 3,
            cellClass: (i, j) =>
              mismatches.some((m) => m.i === i && m.j === j) ? 'cell-differ' : 'cell-match',
            cellMark: (i, j) =>
              mismatches.some((m) => m.i === i && m.j === j) ? '✕' : '✓',
            markDescription:
              'Every cell carries a ✓ where it equals the honest key and a ✕ where it does not.',
          }),
          matrixTable(session.aliceKey, {
            caption: 'The key Alice and Bob actually share',
            compact: preset.n > 3,
          }),
        ),
      );

      const cells = preset.n * preset.n;
      root.append(
        recovery.recovered
          ? verdict(
              'heuristic-outcome',
              'alarm',
              `KEYS AGREE — AND THE EAVESDROPPER HAS THE SAME KEY. All ${cells} entries of the ` +
                'recovered key match the shared key, compared one at a time.',
            )
          : verdict(
              'heuristic-outcome',
              'fail',
              `KEY NOT RECOVERED — the attack returned a matrix, but ${recovery.mismatches.length} of ` +
                `${cells} entries differ from the shared key`,
            ),
      );

      // §4.1d assertion 3: the limitation is ON SCREEN in the fixture state,
      // visible rather than behind a disclosure.
      root.append(
        h(
          'p',
          { class: 'callout callout-danger', 'data-negative-claim': 'eavesdropper-has-key' },
          NEGATIVE_CLAIM,
        ),
      );
      root.append(
        h(
          'p',
          { class: 'help' },
          'Parameter preset in this state: ',
          claim('heuristic-preset', preset.label, preset.id),
          '. Entries compared: ',
          claim('heuristic-cells-compared', String(cells), String(cells)),
          '.',
        ),
      );
      root.append(
        h(
          'p',
          { class: 'help' },
          'Note what X is not: it is almost never Alice’s p₁(A). The attacker does not need ' +
            'her secrets, only some pair that commutes correctly and multiplies to U.',
        ),
      );
    }

    // ── The bite fixture, reachable through a real control ────────────────
    root.append(renderMismatchFixture(preset.n > 3));

    root.append(
      learnerCheck(
        'The scan found a constant difference. Why does that hand over the key?',
        [
          {
            label: 'Because U is then exactly c ⊗ A^⊗ⁱ ⊗ B^⊗ʲ, and those commute correctly',
            correct: true,
          },
          { label: 'Because it reveals Alice’s polynomials', correct: false },
          { label: 'Because the matrices are small', correct: false },
        ],
        'The first. A constant difference means the product reproduces U exactly, and any X, Y ' +
          'that commute with A and B and multiply to U give the key. Alice’s actual ' +
          'coefficients are never recovered and are never needed.',
      ),
    );
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

/**
 * The bite fixture for the "recovered means equal" rule.
 *
 * Same A, B and same session key, but the attacker is handed a DIFFERENT
 * Alice's message U′. The heuristic fires — it finds (2, 2, 5) and returns a
 * well-formed matrix satisfying every condition against U′ — and that matrix
 * is not the session key. A page whose verdict was set by "the attack returned
 * something" would read RECOVERED here and be wrong.
 */
function renderMismatchFixture(compact: boolean): HTMLElement {
  const details = h('details', { class: 'disclosure', id: 'mismatch-fixture' });
  details.append(h('summary', {}, 'What if the attacker has the wrong message?'));
  const body = h('div', { class: 'disclosure-body' });

  const transcript = {
    a: INSTANCE_B.a,
    b: INSTANCE_B.b,
    u: MISMATCHED_MESSAGE.u,
    v: INSTANCE_B.expected.v,
  };
  const result = heuristicAttack(transcript, 3);
  const produced = keyFrom(result.found!.x, transcript.v, result.found!.y);
  const sessionKey = INSTANCE_B.expected.key;
  const mismatches = diffCells(produced, sessionKey);

  body.append(
    h(
      'p',
      {},
      'Keep A, B and the session key, but give the attacker a message from a different Alice. ' +
        'The scan still fires — at i = 2, j = 2, c = 5 — and still returns a perfectly ' +
        'well-formed matrix. It is not the key.',
    ),
    h(
      'div',
      { class: 'matrix-pair' },
      matrixTable(produced, {
        caption: 'What the attack produced',
        compact,
        cellClass: () => 'cell-differ',
        cellMark: () => '✕',
        markDescription: 'Every cell differs from the session key.',
      }),
      matrixTable(sessionKey, { caption: 'The actual session key', compact }),
    ),
    verdict(
      'mismatch-outcome',
      'fail',
      `KEY NOT RECOVERED — the attack returned a matrix, and all ${mismatches.length} entries differ ` +
        'from the session key',
    ),
    h(
      'p',
      { class: 'help' },
      'Entries differing: ',
      claim('mismatch-differing', String(mismatches.length), String(mismatches.length)),
      '. This is why every verdict on this page is the result of comparing the recovered key with ' +
        'the real one, entry by entry, and never the attack reporting its own success.',
    ),
  );

  // A guard on the fixture itself: if this ever equals the session key the
  // exhibit is demonstrating the opposite of what it claims, and says so
  // rather than quietly showing a matching pair.
  if (matEq(produced, sessionKey)) {
    body.append(note('danger', 'This fixture is broken: it must NOT equal the session key.'));
  }

  details.append(body);
  return details;
}

export type { ScanStep };
