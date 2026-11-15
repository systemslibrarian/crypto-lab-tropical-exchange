import './style.css';
import { renderAlgebraPanel } from './ui/algebraPanel.js';
import { renderExchangePanel } from './ui/exchangePanel.js';
import { renderHeuristicPanel } from './ui/heuristicPanel.js';
import { renderLimitsPanel } from './ui/limitsPanel.js';
import { renderGeneralPanel } from './ui/generalPanel.js';
import { renderTrialsPanel } from './ui/trialsPanel.js';

/**
 * Six exhibits, each rendered lazily on first activation.
 *
 * Lazy rendering is why the a11y gate drives the real tab buttons rather than
 * stripping `[hidden]`: a panel that has never been activated is not merely
 * hidden, it is not in the DOM at all, and a scan of it would be a scan of an
 * empty container reporting itself perfectly accessible.
 *
 * [extension] point — a `Scheme` interface would slot in here: each exhibit is
 * already a `(root: HTMLElement) => void` that reads the shared session, so a
 * modified exchange or a tropical signature scheme with its forgery would be
 * added as further entries in this map plus their own panels. Not built here;
 * the page says so.
 */
type PanelKey = 'algebra' | 'exchange' | 'heuristic' | 'limits' | 'general' | 'trials';

const renderers: Record<PanelKey, (root: HTMLElement) => void> = {
  algebra: renderAlgebraPanel,
  exchange: renderExchangePanel,
  heuristic: renderHeuristicPanel,
  limits: renderLimitsPanel,
  general: renderGeneralPanel,
  trials: renderTrialsPanel,
};

const rendered = new Set<PanelKey>();

function panelEl(key: PanelKey): HTMLElement {
  return document.getElementById(`panel-${key}`) as HTMLElement;
}

function ensureRendered(key: PanelKey): void {
  if (rendered.has(key)) return;
  renderers[key](panelEl(key));
  rendered.add(key);
}

function selectTab(key: PanelKey): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  for (const tab of tabs) {
    const isActive = tab.dataset.panel === key;
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    tab.classList.toggle('active', isActive);
    panelEl(tab.dataset.panel as PanelKey).hidden = !isActive;
  }
  ensureRendered(key);
}

function wireTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.panel as PanelKey));
    // Roving-tabindex arrow-key navigation across the tablist (WAI-ARIA).
    tab.addEventListener('keydown', (event) => {
      let next = -1;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        event.preventDefault();
        tabs[next].focus();
        selectTab(tabs[next].dataset.panel as PanelKey);
      }
    });
  });
}

wireTabs();
selectTab('algebra');
