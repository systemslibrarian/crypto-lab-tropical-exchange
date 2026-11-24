/**
 * Exhibit 1 — min-plus arithmetic, computed cell by cell.
 *
 * The one thing this panel has to SHOW rather than assert is that ⊗ is a
 * minimum over sums: the learner picks a cell and watches the three candidate
 * sums appear, with the winning one marked. Nothing here is prose about how
 * tropical multiplication works; the numbers do it.
 *
 * The second half shows the powers of the paper's own matrix falling away,
 * which is the mechanism exhibit 3's attack depends on. It uses the matrix
 * Kotov and Ushakov printed, so a reader can check this page against the PDF.
 */

import {
  formatEntry,
  identity,
  matAdd,
  matMul,
  mulCellTrace,
  type Matrix,
} from '../tropical/tropical.js';
import { powerDecay } from '../tropical/heuristic.js';
import { PAPER_A } from '../tropical/fixtures.js';
import { claim, clear, h, learnerCheck, matrixTable, note, panelIntro } from './dom.js';

const SMALL_X: Matrix = [
  [2, 7],
  [5, 1],
];
const SMALL_Y: Matrix = [
  [3, 8],
  [6, 0],
];

export function renderAlgebraPanel(root: HTMLElement): void {
  clear(root);

  root.append(
    panelIntro(
      'Min-plus arithmetic',
      'Tropical algebra keeps the ordinary numbers and swaps the two operations. Addition becomes ' +
        '"take the smaller one", and multiplication becomes ordinary addition. That is the entire ' +
        'change, and every strange thing on this page follows from it.',
      'Because "add" is now min, there is no subtraction: nothing you can add to 5 gets you back ' +
        'to 3. A structure with that shape is called a semiring. It was proposed as a platform for ' +
        'key exchange precisely because the linear algebra that breaks similar schemes over ordinary ' +
        'numbers has no obvious counterpart here.',
    ),
  );

  const a = h('div', { class: 'rules' });
  a.append(
    h('p', {}, 'a ⊕ b = min(a, b)   ·   a ⊗ b = a + b'),
    h(
      'p',
      { class: 'help' },
      'The neutral element of ⊕ is +∞ (adding it changes nothing, because min(x, ∞) = x) and the ' +
        'neutral element of ⊗ is 0. So the identity matrix carries 0 on the diagonal and +∞ everywhere else.',
    ),
  );
  root.append(a);

  // ── ⊕ and ⊗ on two small matrices ──────────────────────────────────────
  root.append(h('h3', {}, 'Two matrices, both operations'));
  root.append(
    h(
      'div',
      { class: 'matrix-pair' },
      matrixTable(SMALL_X, { caption: 'X', compact: true }),
      matrixTable(SMALL_Y, { caption: 'Y', compact: true }),
    ),
  );
  root.append(
    h(
      'div',
      { class: 'matrix-pair' },
      matrixTable(matAdd(SMALL_X, SMALL_Y), {
        caption: 'X ⊕ Y — the smaller entry in each cell',
        compact: true,
      }),
      matrixTable(matMul(SMALL_X, SMALL_Y), {
        caption: 'X ⊗ Y — see the working below',
        compact: true,
      }),
    ),
  );

  // ── The cell-by-cell trace: the mechanism, shown ───────────────────────
  root.append(h('h3', {}, 'Where one cell of X ⊗ Y comes from'));
  root.append(
    h(
      'p',
      { class: 'help' },
      'Pick a cell. The product runs over every path through the middle index k, adds the two ' +
        'entries, and keeps the smallest sum.',
    ),
  );

  const cellPicker = h('div', { class: 'input-row', role: 'group', 'aria-label': 'Choose a cell of X ⊗ Y' });
  const traceOut = h('div', { class: 'trace-out', role: 'status', 'aria-live': 'polite' });

  const renderTrace = (i: number, j: number): void => {
    clear(traceOut);
    const trace = mulCellTrace(SMALL_X, SMALL_Y, i, j);
    const list = h('ul', { class: 'trace-list', role: 'list' });
    for (const term of trace.terms) {
      const winner = trace.argmin.includes(term.k);
      list.append(
        h(
          'li',
          { class: winner ? 'trace-term is-min' : 'trace-term', role: 'listitem' },
          h(
            'code',
            {},
            `X[${i + 1}][${term.k + 1}] ⊗ Y[${term.k + 1}][${j + 1}] = ` +
              `${formatEntry(SMALL_X[i][term.k])} + ${formatEntry(SMALL_Y[term.k][j])} = ${formatEntry(term.value)}`,
          ),
          winner ? h('span', { class: 'pill pill-ok' }, h('span', { 'aria-hidden': 'true' }, '✓ '), 'smallest') : null,
        ),
      );
    }
    traceOut.append(
      h('p', { class: 'trace-head' }, `Cell (row ${i + 1}, column ${j + 1}):`),
      list,
      h(
        'p',
        { class: 'trace-result' },
        'Result: ',
        claim(`algebra-cell-${i}${j}`, formatEntry(trace.min), String(trace.min)),
      ),
    );
  };

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost cell-btn',
          'aria-pressed': i === 0 && j === 0 ? 'true' : 'false',
          onclick: () => {
            for (const other of cellPicker.querySelectorAll('button')) {
              other.setAttribute('aria-pressed', 'false');
            }
            button.setAttribute('aria-pressed', 'true');
            renderTrace(i, j);
          },
        },
        `row ${i + 1}, column ${j + 1}`,
      );
      cellPicker.append(button);
    }
  }
  root.append(cellPicker, traceOut);
  renderTrace(0, 0);

  // ── The identity ───────────────────────────────────────────────────────
  root.append(h('h3', {}, 'The identity matrix'));
  root.append(
    matrixTable(identity(3), {
      caption: 'I — 0 on the diagonal, +∞ elsewhere',
      compact: true,
    }),
  );
  root.append(
    h(
      'p',
      { class: 'help' },
      'This is why a polynomial’s constant term matters here: it contributes c ⊗ I, which is ' +
        'finite only on the diagonal. Leave it out and the exchange computes different messages ' +
        'and a different key.',
    ),
  );

  // ── The powers falling away ────────────────────────────────────────────
  root.append(h('h3', {}, 'What happens to the powers of a matrix'));
  root.append(
    h(
      'p',
      { class: 'help' },
      'This is the matrix printed in the Kotov–Ushakov paper, with entries drawn from [-100, 100]. ' +
        'Each tropical power takes a minimum over longer and longer sums. For this matrix the entries slide ' +
        'downward — and they do it fast.',
    ),
  );
  root.append(matrixTable(PAPER_A, { caption: 'A, from the paper', compact: true }));

  const decay = powerDecay(PAPER_A, 5);
  const table = h('table', { class: 'counts-table' });
  table.append(
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, 'power'),
        h('th', { scope: 'col' }, 'smallest entry'),
        h('th', { scope: 'col' }, 'largest entry'),
        h('th', { scope: 'col' }, 'change in largest entry'),
      ),
    ),
  );
  const tbody = h('tbody');
  for (const [index, row] of decay.entries()) {
    const previous = index === 0 ? null : decay[index - 1];
    tbody.append(
      h(
        'tr',
        {},
        h('th', { scope: 'row' }, `A^⊗${row.power}`),
        h('td', { class: 'num' }, formatEntry(row.min)),
        h('td', { class: 'num' }, formatEntry(row.max)),
        h('td', { class: 'num' }, previous === null ? '—' : String(row.max - previous.max)),
      ),
    );
  }
  table.append(tbody);
  root.append(
    h(
      'div',
      { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Entry ranges of the powers of A' },
      table,
    ),
  );

  root.append(
    note(
      'info',
      'The last column compares the largest entries. It does not measure the change in each cell. ' +
        'For contrast, every power of the min-plus identity matrix is the identity again.',
    ),
  );

  root.append(
    learnerCheck(
      'In min-plus algebra, what is 5 ⊕ 3 ⊗ 2?',
      [
        { label: '5', correct: true },
        { label: '10', correct: false },
        { label: '16', correct: false },
      ],
      '⊗ binds first, so it is 5 ⊕ (3 + 2) = min(5, 5) = 5. The habit to break is reading ⊕ as ' +
        'ordinary addition: it is a minimum, and it is the operation with no inverse.',
    ),
  );

  root.append(
    note(
      'caveat',
      'Not built here: this page is about one protocol over this semiring. Tropical signature ' +
        'schemes and the later modified exchanges are out of scope, and nothing on this page is ' +
        'evidence about them.',
    ),
  );
}
