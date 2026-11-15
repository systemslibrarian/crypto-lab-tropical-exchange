/**
 * Dependency-free DOM helpers shared by the panels.
 *
 * Nothing here ever builds markup from a string. Every value this lab renders —
 * matrix entries, coefficient lists, error messages — passes through
 * `createTextNode`, so a learner's typed input cannot become markup.
 */

import { formatEntry, type Matrix, type Trop } from '../tropical/tropical.js';

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined;

/** Hyperscript: h('button', { class: 'x', onclick: fn }, 'label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Section heading plus intro paragraphs for a panel. */
export function panelIntro(title: string, ...paragraphs: (string | HTMLElement)[]): HTMLElement {
  return h(
    'div',
    { class: 'panel-intro' },
    h('h2', {}, title),
    ...paragraphs.map((p) => (typeof p === 'string' ? h('p', {}, p) : p)),
  );
}

/** A scoping note: what is real, what this is not. */
export function note(kind: 'info' | 'danger' | 'caveat', ...children: Child[]): HTMLElement {
  return h('p', { class: `callout callout-${kind}` }, ...children);
}

/**
 * A verdict: icon, text and colour together, never colour alone (WCAG 1.4.1).
 *
 * `data-verdict` and `data-result` are the markers the claims suite and the
 * mutation ledger address. Every rendered outcome in this lab carries one, so
 * coverage is read off the page rather than from a list someone maintains.
 */
export function verdict(
  id: string,
  state: 'pass' | 'fail' | 'alarm' | 'pending',
  text: string,
): HTMLElement {
  const icon = state === 'pass' ? '✓' : state === 'alarm' ? '⚠' : state === 'fail' ? '✕' : '○';
  return h(
    'div',
    {
      class: `verdict verdict-${state}`,
      role: 'status',
      'aria-live': 'polite',
      'data-verdict': id,
      'data-result': state,
    },
    h('span', { class: 'verdict-icon', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'verdict-text' }, text),
  );
}

/** A rendered measurement: the number a reader sees, with its machine value beside it. */
export function claim(id: string, text: string, value: string): HTMLElement {
  return h('span', { class: 'claim', 'data-claim': id, 'data-value': value }, text);
}

/** A labelled read-only value. */
export function field(label: string, value: string): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('code', { class: 'field-value' }, value),
  );
}

/** Evidence that no longer belongs to the controls on screen. */
export function evidenceRetired(text: string): HTMLElement {
  return h(
    'p',
    { class: 'callout callout-caveat evidence-retired', role: 'status', 'aria-live': 'polite' },
    text,
  );
}

export interface MatrixOptions {
  /** Caption above the table. */
  readonly caption?: string;
  /** Per-cell extra class and marker, for highlighting without relying on colour. */
  readonly cellClass?: (i: number, j: number, value: Trop) => string | undefined;
  /** Per-cell text appended after the number, e.g. a ✓ on matching cells. */
  readonly cellMark?: (i: number, j: number, value: Trop) => string | undefined;
  /** Accessible description of what the mark means. */
  readonly markDescription?: string;
  readonly compact?: boolean;
}

/**
 * A matrix as a real table with row and column headers.
 *
 * The numbers here run to twelve digits, so the table is wrapped in a scroll
 * region rather than being allowed to push the page sideways (WCAG 1.4.10).
 * The region is focusable with a role and a label, because a scrollable area
 * that cannot be reached from the keyboard fails 2.1.1 — and that pairing is
 * the one the CI gate's Linux runner catches when a local browser does not.
 */
export function matrixTable(m: Matrix, options: MatrixOptions = {}): HTMLElement {
  const n = m.length;
  const label = options.caption ?? 'matrix';
  const table = h('table', { class: `matrix-table${options.compact ? ' compact' : ''}` });

  const head = h('thead');
  const headRow = h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'row')));
  for (let j = 0; j < n; j++) headRow.append(h('th', { scope: 'col' }, `c${j + 1}`));
  head.append(headRow);
  table.append(head);

  const body = h('tbody');
  for (let i = 0; i < n; i++) {
    const row = h('tr', {}, h('th', { scope: 'row' }, `r${i + 1}`));
    for (let j = 0; j < n; j++) {
      const value = m[i][j];
      const extra = options.cellClass?.(i, j, value);
      const mark = options.cellMark?.(i, j, value);
      row.append(
        h(
          'td',
          { class: extra ? `matrix-cell ${extra}` : 'matrix-cell' },
          h('span', { class: 'cell-value' }, formatEntry(value)),
          mark ? h('span', { class: 'cell-mark' }, ` ${mark}`) : null,
        ),
      );
    }
    body.append(row);
  }
  table.append(body);

  const wrap = h(
    'div',
    {
      class: 'table-wrap',
      tabindex: '0',
      role: 'region',
      'aria-label': `${label}, ${n} by ${n}`,
    },
    table,
  );

  return h(
    'figure',
    { class: 'matrix-figure' },
    options.caption ? h('figcaption', {}, options.caption) : null,
    wrap,
    options.markDescription ? h('p', { class: 'figure-note' }, options.markDescription) : null,
  );
}

/** A coefficient list, lowest degree first, rendered as the polynomial it is. */
export function polyText(coefficients: readonly Trop[], variable: string): string {
  return coefficients
    .map((c, i) => {
      const term = i === 0 ? 'I' : i === 1 ? variable : `${variable}^⊗${i}`;
      return `${formatEntry(c)} ⊗ ${term}`;
    })
    .join('  ⊕  ');
}

/**
 * A "predict before you reveal" check: one misconception, a few choices, an
 * immediate explanation. No score and no gating — the lab works either way.
 */
export function learnerCheck(
  question: string,
  options: { label: string; correct: boolean }[],
  explanation: string,
): HTMLElement {
  const feedback = h('div', { class: 'check-feedback', role: 'status', 'aria-live': 'polite' });
  const buttons = options.map((option) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-ghost check-opt',
        onclick: () => {
          clear(feedback);
          feedback.append(
            h(
              'span',
              { class: `pill pill-${option.correct ? 'ok' : 'bad'}` },
              h('span', { 'aria-hidden': 'true' }, option.correct ? '✓ ' : '✕ '),
              option.correct ? 'Correct' : 'Not quite',
            ),
            h('p', { class: 'check-explain' }, explanation),
          );
        },
      },
      option.label,
    ),
  );
  return h(
    'details',
    { class: 'learner-check' },
    h('summary', {}, 'Quick check'),
    h(
      'div',
      { class: 'check-body' },
      h('p', { class: 'check-q' }, question),
      h('div', { class: 'input-row', role: 'group', 'aria-label': question }, ...buttons),
      feedback,
    ),
  );
}

/** A labelled text input with its help line, wired to a change handler. */
export function textControl(options: {
  id: string;
  label: string;
  value: string;
  help?: string;
  rows?: number;
  onInput?: (value: string) => void;
}): { wrap: HTMLElement; input: HTMLTextAreaElement | HTMLInputElement } {
  const input = (
    options.rows && options.rows > 1
      ? h('textarea', { id: options.id, class: 'mono-input', rows: options.rows })
      : h('input', { id: options.id, class: 'mono-input', type: 'text' })
  ) as HTMLTextAreaElement | HTMLInputElement;
  input.value = options.value;
  if (options.onInput) {
    input.addEventListener('input', () => options.onInput?.(input.value));
  }
  const wrap = h(
    'div',
    { class: 'control' },
    h('label', { for: options.id }, options.label),
    input,
    options.help ? h('p', { class: 'help' }, options.help) : null,
  );
  return { wrap, input };
}
