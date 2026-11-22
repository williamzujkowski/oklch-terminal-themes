import type { ExplorerState } from './explorer-state';
import { parseExplorerState } from './explorer-state';
import { INSPECTOR_ROLES } from './role-metrics';
import type { Preview } from './comparison-preview';

export interface Controls {
  doc: Document;
  win: Window;
  signal: AbortSignal;
  catalog: string[];
  getState: () => ExplorerState;
  commit: (state: ExplorerState, history?: 'push' | 'replace') => void;
}
function setValue(doc: Document, selector: string, value: string): void {
  const element = doc.querySelector<HTMLSelectElement>(selector);
  if (element) element.value = value;
}
export function syncControls(c: Controls): void {
  const state = c.getState();
  for (const key of ['view', 'sample', 'size', 'recipe'] as const)
    setValue(c.doc, `[data-${key}]`, String(state[key]));
  setValue(c.doc, '[data-reference]', state.reference ?? '');
  const sample = c.doc.querySelector<HTMLSelectElement>('[data-sample]');
  if (sample) sample.disabled = state.view !== 'dashboard';
  for (const button of c.doc.querySelectorAll<HTMLButtonElement>('[data-swap], [data-unpin]'))
    button.disabled = state.reference === null;
  c.doc.querySelector('.comparison-grid')?.classList.toggle('single', state.reference === null);
}
function choosePresentation(c: Controls, key: string, value: string): void {
  const url = new URL(c.win.location.href);
  url.searchParams.set(key, value);
  if (key === 'view' && value !== 'dashboard') url.searchParams.delete('sample');
  const parsed = parseExplorerState(url.search, c.catalog, INSPECTOR_ROLES).state;
  if (parsed) c.commit(parsed);
}
function onClick(c: Controls, event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const state = c.getState();
  if (target.closest('[data-pin]')) c.commit({ ...state, reference: state.theme });
  if (target.closest('[data-unpin]')) c.commit({ ...state, reference: null });
  if (target.closest('[data-swap]') && state.reference)
    c.commit({ ...state, theme: state.reference, reference: state.theme });
  if (target.closest('[data-open-inspector]')) c.commit({ ...state, role: 'body' });
  if (target.closest('[data-close-inspector]')) c.commit({ ...state, role: null });
}
export function wireControls(c: Controls): void {
  for (const key of ['view', 'sample', 'size', 'recipe'] as const)
    c.doc.querySelector(`[data-${key}]`)?.addEventListener(
      'change',
      (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement) choosePresentation(c, key, target.value);
      },
      { signal: c.signal },
    );
  c.doc.querySelector('[data-reference]')?.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement)
        c.commit({
          ...c.getState(),
          reference: c.catalog.includes(target.value) ? target.value : null,
        });
    },
    { signal: c.signal },
  );
  c.doc.querySelector('[data-inspected-role]')?.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && INSPECTOR_ROLES.includes(target.value))
        c.commit({ ...c.getState(), role: target.value });
    },
    { signal: c.signal },
  );
  c.doc.addEventListener('click', (event) => onClick(c, event), { signal: c.signal });
}
export function wireMobile(c: Controls, panes: Preview[]): () => void {
  let active = 'b';
  const media = c.win.matchMedia('(max-width: 900px)');
  const refresh = (): void => {
    for (const pane of panes) {
      const hidden = media.matches && c.getState().reference !== null && pane.id !== active;
      pane.root.toggleAttribute('data-mobile-hidden', hidden);
      pane.root.inert = hidden || Boolean(pane.root.hidden);
    }
    for (const button of c.doc.querySelectorAll<HTMLElement>('[data-mobile-pane]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mobilePane === active));
      button.hidden = c.getState().reference === null;
    }
  };
  for (const button of c.doc.querySelectorAll<HTMLElement>('[data-mobile-pane]'))
    button.addEventListener(
      'click',
      () => {
        active = button.dataset.mobilePane ?? 'b';
        refresh();
      },
      { signal: c.signal },
    );
  media.addEventListener('change', refresh, { signal: c.signal });
  return refresh;
}
