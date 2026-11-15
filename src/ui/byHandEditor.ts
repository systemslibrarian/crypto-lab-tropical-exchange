/**
 * The by-hand editor: type your own A, B and four polynomials.
 *
 * This is where a learner can break things on purpose, so it is where the
 * fail-closed paths have to be visible. Every refusal below renders the
 * reason, and none of them produces a key:
 *
 *  - a commuting A, B pair (try B = A, or B = A ⊗ A)
 *  - a degree outside the preset's range
 *  - a non-integer or non-square input
 *  - a hand-edited U with no solution (exhibit 5 reports it)
 */

import { parsePoly, presetById, runExchange } from '../tropical/protocol.js';
import { TropicalError, formatEntry, formatMatrix, parseMatrix } from '../tropical/tropical.js';
import { INSTANCE_B, INSTANCE_C } from '../tropical/fixtures.js';
import { clear, h, textControl } from './dom.js';
import { resetToWorkedInstance, setSession } from './state.js';

const byHand = presetById('by-hand');

export function renderByHandEditor(): HTMLElement {
  const wrap = h('details', { class: 'disclosure', id: 'by-hand-editor' });
  wrap.append(h('summary', {}, 'Edit this instance by hand'));
  const body = h('div', { class: 'disclosure-body' });
  wrap.append(body);

  const status = h('div', { class: 'editor-status', role: 'status', 'aria-live': 'polite' });

  const matrixA = textControl({
    id: 'edit-a',
    label: 'A (3×3, integers)',
    value: formatMatrix(INSTANCE_B.a),
    rows: 2,
  });
  const matrixB = textControl({
    id: 'edit-b',
    label: 'B (3×3, integers)',
    value: formatMatrix(INSTANCE_B.b),
    rows: 2,
  });
  const poly = (id: string, label: string, value: readonly number[]) =>
    textControl({
      id,
      label,
      value: value.map(formatEntry).join(', '),
      help: 'Lowest degree first. Degree must be 1 to 3 here.',
    });
  const p1 = poly('edit-p1', 'Alice’s p₁', INSTANCE_B.p1);
  const p2 = poly('edit-p2', 'Alice’s p₂', INSTANCE_B.p2);
  const q1 = poly('edit-q1', 'Bob’s q₁', INSTANCE_B.q1);
  const q2 = poly('edit-q2', 'Bob’s q₂', INSTANCE_B.q2);

  const inputs = [matrixA, matrixB, p1, p2, q1, q2];
  for (const control of inputs) {
    control.input.addEventListener('input', () => {
      control.input.setAttribute('aria-invalid', 'false');
      clear(status);
      status.append(
        h('p', { class: 'callout callout-caveat' }, 'Inputs changed — apply them to recompute.'),
      );
    });
  }

  const apply = (): void => {
    clear(status);
    for (const control of inputs) control.input.setAttribute('aria-invalid', 'false');
    try {
      const a = parseMatrix(matrixA.input.value, 3);
      const b = parseMatrix(matrixB.input.value, 3);
      const session = runExchange({
        preset: byHand,
        a,
        b,
        p1: parsePoly(p1.input.value, byHand, 'p₁'),
        p2: parsePoly(p2.input.value, byHand, 'p₂'),
        q1: parsePoly(q1.input.value, byHand, 'q₁'),
        q2: parsePoly(q2.input.value, byHand, 'q₂'),
      });
      setSession(session, 'by-hand');
    } catch (error) {
      const message = error instanceof TropicalError ? error.message : String(error);
      // Mark the control the message is about, so the failure has a location
      // as well as a sentence.
      const target = inputs.find((c) => message.includes(c.input.id.replace('edit-', '')));
      (target ?? matrixA).input.setAttribute('aria-invalid', 'true');
      status.append(
        h(
          'div',
          {
            class: 'verdict verdict-fail',
            role: 'status',
            'aria-live': 'polite',
            'data-verdict': 'by-hand-refused',
            'data-result': 'fail',
          },
          h('span', { class: 'verdict-icon', 'aria-hidden': 'true' }, '✕'),
          h('span', { class: 'verdict-text' }, `REFUSED — ${message}`),
        ),
      );
    }
  };

  body.append(
    h('p', {}, 'Change anything here and apply it. Invalid input is refused with the reason, and ' +
      'no key is produced from input the protocol would not accept.'),
    h('div', { class: 'matrix-pair' }, matrixA.wrap, matrixB.wrap),
    h('div', { class: 'matrix-pair' }, p1.wrap, p2.wrap),
    h('div', { class: 'matrix-pair' }, q1.wrap, q2.wrap),
    h(
      'div',
      { class: 'input-row' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'apply-by-hand', onclick: apply }, 'Apply'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost',
          onclick: () => {
            matrixA.input.value = formatMatrix(INSTANCE_B.a);
            matrixB.input.value = formatMatrix(INSTANCE_B.b);
            p1.input.value = INSTANCE_B.p1.map(formatEntry).join(', ');
            p2.input.value = INSTANCE_B.p2.map(formatEntry).join(', ');
            q1.input.value = INSTANCE_B.q1.map(formatEntry).join(', ');
            q2.input.value = INSTANCE_B.q2.map(formatEntry).join(', ');
            clear(status);
            resetToWorkedInstance();
          },
        },
        'Reset to the worked instance',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost',
          id: 'load-instance-c',
          onclick: () => {
            matrixA.input.value = formatMatrix(INSTANCE_C.a);
            matrixB.input.value = formatMatrix(INSTANCE_C.b);
            p1.input.value = INSTANCE_C.p1.map(formatEntry).join(', ');
            p2.input.value = INSTANCE_C.p2.map(formatEntry).join(', ');
            q1.input.value = INSTANCE_C.q1.map(formatEntry).join(', ');
            q2.input.value = INSTANCE_C.q2.map(formatEntry).join(', ');
            clear(status);
            apply();
          },
        },
        'Load the all-positive instance',
      ),
    ),
    h(
      'p',
      { class: 'help' },
      'To see a refusal: set B to the same matrix as A. The pair then commutes, and the exchange ' +
        'is refused rather than silently producing a key nobody should trust.',
    ),
    status,
  );

  return wrap;
}
