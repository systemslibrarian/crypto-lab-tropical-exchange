/**
 * Exhibit 2 — the exchange itself.
 *
 * The headline mechanism here is that two parties who never shared anything
 * secret arrive at the same matrix. So the panel COMPUTES BOTH SIDES AND
 * COMPARES them, entry by entry, rather than printing one key and asserting
 * the other matches. The verdict is the comparison's own result.
 *
 * The secrets and the public transcript are visually and structurally
 * separated, because the next three exhibits depend on the reader knowing
 * exactly which four matrices an eavesdropper actually has.
 */

import { PRESETS, presetById, type PresetId } from '../tropical/protocol.js';
import { diffCells, formatEntry, maxAbsFinite } from '../tropical/tropical.js';
import { claim, clear, h, learnerCheck, matrixTable, note, panelIntro, verdict } from './dom.js';
import { getState, regenerate, subscribe } from './state.js';
import { renderByHandEditor } from './byHandEditor.js';

export function renderExchangePanel(root: HTMLElement): void {
  const render = (): void => {
    const { presetId, session } = getState();
    const preset = presetById(presetId);
    clear(root);

    root.append(
      panelIntro(
        'The exchange',
        'Alice and Bob agree in public on two matrices A and B that do not commute. Each privately ' +
          'picks two polynomials, evaluates one at A and one at B, multiplies them together, and ' +
          'sends the result. Each then folds the other’s message between their own two secrets.',
        'Both land on the same matrix, because a polynomial in A commutes with any other polynomial ' +
          'in A. That commuting is what makes the protocol work — and, three exhibits from now, what ' +
          'makes it breakable.',
      ),
    );

    // ── Preset selection ─────────────────────────────────────────────────
    const presetRow = h('div', {
      class: 'preset-row',
      role: 'group',
      'aria-label': 'Parameter preset',
    });
    for (const option of PRESETS) {
      presetRow.append(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost preset-btn',
            'aria-pressed': option.id === presetId ? 'true' : 'false',
            onclick: () => regenerate(option.id as PresetId),
          },
          option.label,
        ),
      );
    }
    root.append(
      h(
        'div',
        { class: 'controls' },
        h('div', { class: 'control' }, h('span', { class: 'control-label' }, 'Parameters'), presetRow),
        h('p', { class: 'help' }, preset.note),
        h(
          'div',
          { class: 'input-row' },
          h(
            'button',
            { type: 'button', class: 'btn btn-primary', onclick: () => regenerate() },
            'Generate a fresh instance',
          ),
        ),
      ),
    );

    root.append(
      h(
        'p',
        { class: 'help' },
        `n = ${preset.n}; matrix entries uniform in [${compact(preset.matrixLo)}, ${compact(preset.matrixHi)}]; ` +
          `degrees uniform in ${preset.degreeLo}..${preset.degreeHi}; coefficients uniform in ` +
          `[${compact(preset.coefficientLo)}, ${compact(preset.coefficientHi)}]. ` +
          'Every draw comes from the browser’s cryptographic generator by rejection sampling.',
      ),
    );

    // ── The by-hand editor, only where the numbers are small enough ──────
    if (presetId === 'by-hand') {
      root.append(renderByHandEditor());
    }

    // ── Public values ────────────────────────────────────────────────────
    root.append(h('h3', {}, 'Public: everyone sees these'));
    root.append(
      h(
        'div',
        { class: 'matrix-pair' },
        matrixTable(session.transcript.a, { caption: 'A', compact: preset.n > 3 }),
        matrixTable(session.transcript.b, { caption: 'B', compact: preset.n > 3 }),
      ),
    );
    root.append(
      verdict(
        'bases-noncommuting',
        'pass',
        'A ⊗ B ≠ B ⊗ A — the pair is usable, checked at generation and regenerated if it was not',
      ),
    );

    // ── Secrets, marked as such ──────────────────────────────────────────
    root.append(
      h(
        'div',
        { class: 'view-split' },
        secretCard('Alice', session.alice.first, session.alice.second),
        secretCard('Bob', session.bob.first, session.bob.second),
      ),
    );

    // ── The messages ─────────────────────────────────────────────────────
    root.append(h('h3', {}, 'The two messages, sent in the open'));
    root.append(
      h(
        'div',
        { class: 'matrix-pair' },
        matrixTable(session.transcript.u, {
          caption: 'U = p₁(A) ⊗ p₂(B) — Alice to Bob',
          compact: preset.n > 3,
        }),
        matrixTable(session.transcript.v, {
          caption: 'V = q₁(A) ⊗ q₂(B) — Bob to Alice',
          compact: preset.n > 3,
        }),
      ),
    );

    // ── Both sides computed and compared ─────────────────────────────────
    root.append(h('h3', {}, 'Both parties compute a key, independently'));
    const mismatches = diffCells(session.aliceKey, session.bobKey);
    root.append(
      h(
        'div',
        { class: 'matrix-pair' },
        matrixTable(session.aliceKey, {
          caption: 'Kₐ = p₁(A) ⊗ V ⊗ p₂(B), computed by Alice',
          compact: preset.n > 3,
          cellClass: (i, j) =>
            mismatches.some((m) => m.i === i && m.j === j) ? 'cell-differ' : undefined,
        }),
        matrixTable(session.bobKey, {
          caption: 'K_b = q₁(A) ⊗ U ⊗ q₂(B), computed by Bob',
          compact: preset.n > 3,
          cellClass: (i, j) =>
            mismatches.some((m) => m.i === i && m.j === j) ? 'cell-differ' : undefined,
        }),
      ),
    );

    const cells = preset.n * preset.n;
    root.append(
      session.keysAgree
        ? verdict(
            'keys-agree',
            'pass',
            `KEYS AGREE — all ${cells} entries identical, compared one at a time`,
          )
        : verdict(
            'keys-agree',
            'fail',
            `KEYS DIFFER in ${mismatches.length} of ${cells} entries — this is not a working exchange`,
          ),
    );
    root.append(
      h(
        'p',
        { class: 'help' },
        'Entries compared: ',
        claim('key-cells-compared', String(cells), String(cells)),
        '. Largest absolute entry in the shared key: ',
        claim(
          'key-max-entry',
          maxAbsFinite(session.aliceKey).toLocaleString('en-US'),
          String(maxAbsFinite(session.aliceKey)),
        ),
        '. JavaScript represents integers exactly below 9,007,199,254,740,991, and every entry ' +
          'here is checked against that bound rather than assumed to be inside it.',
      ),
    );

    root.append(
      learnerCheck(
        'Alice and Bob computed the same key. What has that established?',
        [
          { label: 'That the protocol ran correctly', correct: true },
          { label: 'That the key is secret', correct: false },
          { label: 'That an eavesdropper cannot compute it', correct: false },
        ],
        'Only the first. Agreement is a correctness property, not a security one — it says the two ' +
          'sides did the same arithmetic. Whether anybody else can do that arithmetic from A, B, U ' +
          'and V alone is a completely separate question, and the next exhibit answers it.',
      ),
    );

    root.append(
      note(
        'danger',
        'Not production cryptography — a teaching demo. This scheme was never deployed, and the ' +
          'next two exhibits show why it should not be. Secrets are printed on screen on purpose.',
      ),
    );
  };

  render();
  subscribe(render);
}

function secretCard(who: string, first: readonly number[], second: readonly number[]): HTMLElement {
  return h(
    'div',
    { class: 'view-card is-secret' },
    h('span', { class: 'view-tag' }, `${who.toUpperCase()}’S SECRETS`),
    h('h3', {}, `${who} picked`),
    h('p', { class: 'field-value' }, `${who === 'Alice' ? 'p₁' : 'q₁'} = (${first.map(formatEntry).join(', ')})`),
    h('p', { class: 'field-value' }, `${who === 'Alice' ? 'p₂' : 'q₂'} = (${second.map(formatEntry).join(', ')})`),
    h(
      'p',
      { class: 'help' },
      'Coefficients lowest degree first. These never go on the wire, and the attack code in ' +
        'exhibits 3 and 5 cannot reach them.',
    ),
  );
}

/** 10000000000 reads as 10¹⁰; smaller bounds stay as they are. */
function compact(value: number): string {
  if (Math.abs(value) === 1e10) return value < 0 ? '-10¹⁰' : '10¹⁰';
  return value.toLocaleString('en-US');
}
