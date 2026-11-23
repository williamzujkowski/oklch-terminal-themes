import { createActiveThemeStore } from './active-theme-store';
import { createListbox } from './theme-listbox';
import { createPreview, presentPreview } from './comparison-preview';
import { serializeExplorerState, type ExplorerState } from './explorer-state';
import { normalizePageState, parsePageState } from './page-state';
import { wireControls, syncControls, wireMobile, type Controls } from './comparison-controls';
import { createEffects, refreshEffects, wireShares } from './comparison-effects';
import { wireDemoState, DEMO_STATE_EVENT } from './demo-state';
import { wireClipboard } from './theme-clipboard';
import { wireShortlist } from './shortlist-ui';

export function initComparison(doc: Document, win: Window): () => void {
  const listeners = new AbortController();
  const signal = listeners.signal;
  const catalog = readCatalog(doc);
  const store = createComparisonStore(doc, win, catalog);
  const initial = parsePageState(doc, win.location.search, catalog);
  if (!initial.state) return () => listeners.abort();
  let state = initial.state;
  const effects = createEffects({ doc, win, store, signal, panes: [], state: () => state });
  setupPreviews(effects, store);
  const commit = (next: ExplorerState, history: 'push' | 'replace' = 'push'): void => {
    state = normalizePageState(doc, next);
    const url = serializeExplorerState(state, new URL(win.location.href));
    if (url.href !== win.location.href)
      win.history[history === 'push' ? 'pushState' : 'replaceState'](null, '', url.href);
    render();
  };
  const controls: Controls = { doc, win, signal, catalog, getState: () => state, commit };
  const listbox = createListbox(doc, win, {
    signal,
    currentSlug: () => state.theme,
    selectSlug: (slug) => commit({ ...state, theme: slug }),
    onBrowseChange: (browse, history) =>
      commit(
        { ...state, query: browse.filter.query, tags: [...browse.filter.tags], sort: browse.sort },
        history,
      ),
  });
  const mobile = wireMobile(controls, effects.panes);
  const render = (): void => {
    for (const pane of effects.panes) presentPreview(pane, state);
    syncControls(controls);
    mobile();
    listbox.syncFromUrl();
    refreshEffects(effects);
    shortlist?.refresh();
  };
  const shortlist = setupShortlist(controls);
  wireControls(controls);
  wireShares(effects);
  wireDemoState(doc, signal);
  wireNavigation(controls, listbox);
  wireHistory(controls);
  wirePaneEffects(controls, effects, store);
  const notice = doc.querySelector('[data-explorer-notice]');
  if (notice) notice.textContent = initial.notices.join(' ');
  commit(state, 'replace');
  return () => listeners.abort();
}
function wireHistory(c: Controls): void {
  c.win.addEventListener(
    'popstate',
    () => {
      const next = parsePageState(c.doc, c.win.location.search, c.catalog);
      if (next.state) c.commit(next.state, 'replace');
      const notice = c.doc.querySelector('[data-explorer-notice]');
      if (notice) notice.textContent = next.notices.join(' ');
    },
    { signal: c.signal },
  );
}
function wireNavigation(c: Controls, listbox: ReturnType<typeof createListbox>): void {
  const step = (delta: number): void => {
    const slugs = listbox.visibleSlugs();
    if (!slugs.length) return;
    const index = slugs.indexOf(c.getState().theme);
    const from = index < 0 ? (delta > 0 ? -1 : 0) : index;
    const slug = slugs[(from + delta + slugs.length) % slugs.length];
    if (slug) c.commit({ ...c.getState(), theme: slug });
  };
  for (const button of c.doc.querySelectorAll<HTMLElement>('[data-nav]'))
    button.addEventListener('click', () => step(button.dataset.nav === 'next' ? 1 : -1), {
      signal: c.signal,
    });
  c.doc.querySelector('[data-action="random"]')?.addEventListener(
    'click',
    () => {
      const slugs = listbox.visibleSlugs();
      const slug = slugs[Math.floor(Math.random() * slugs.length)];
      if (slug) c.commit({ ...c.getState(), theme: slug });
    },
    { signal: c.signal },
  );
  c.doc.addEventListener(
    'keydown',
    (event) => {
      if (closePopup(event, listbox)) return;
      if (modified(event) || c.doc.activeElement !== c.doc.body) return;
      if (event.key === '/') {
        event.preventDefault();
        listbox.open();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      }
      if (event.key.toLowerCase() === 'r')
        c.doc.querySelector<HTMLElement>('[data-action="random"]')?.click();
    },
    { signal: c.signal },
  );
}

function setupShortlist(c: Controls) {
  const catalog = Array.from(c.doc.querySelectorAll<HTMLElement>('.listbox-item')).flatMap(
    (item) =>
      item.dataset.slug
        ? [{ slug: item.dataset.slug, name: item.dataset.name ?? item.dataset.slug }]
        : [],
  );
  return wireShortlist(c.doc, {
    catalog,
    storage: () => c.win.localStorage,
    getCandidate: () => c.getState().theme,
    selectCandidate: (slug) => c.commit({ ...c.getState(), theme: slug }),
    selectReference: (slug) => c.commit({ ...c.getState(), reference: slug }),
    signal: c.signal,
  });
}

function wirePaneEffects(
  c: Controls,
  effects: ReturnType<typeof createEffects>,
  store: ReturnType<typeof createActiveThemeStore>,
): void {
  // Scoped clipboard wiring follows the pane export adapter.
  for (const pane of effects.panes)
    wireClipboard(pane.root, c.win, {
      signal: c.signal,
      currentSlug: () => pane.slug,
      resolve: pane.selection.resolveForExport,
      resolveFull: async (slug) => {
        const ready = await pane.selection.resolveForExport(slug);
        return ready ? store.details?.(slug) : undefined;
      },
      recipe: () => c.getState().recipe,
      label: `Pane ${pane.id.toUpperCase()}`,
    });
  wireFocusEffects(c, effects);
  c.doc.addEventListener(
    DEMO_STATE_EVENT,
    (event) => {
      if (event instanceof CustomEvent)
        effects.selectedSeries = Number(event.detail.selectedSeries) || 0;
      refreshEffects(effects);
    },
    { signal: c.signal },
  );
}

function modified(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function setupPreviews(
  effects: ReturnType<typeof createEffects>,
  store: ReturnType<typeof createActiveThemeStore>,
): void {
  const { doc, signal } = effects;
  const options = { doc, store, signal, changed: () => refreshEffects(effects) };
  for (const id of ['a', 'b'] as const) {
    const root = doc.querySelector<HTMLElement>(`.showcase[data-pane="${id}"]`);
    if (root) effects.panes.push(createPreview(root, id, options));
  }
}

function readCatalog(doc: Document): string[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('.listbox-item')).flatMap((item) =>
    item.dataset.slug ? [item.dataset.slug] : [],
  );
}

function closePopup(event: KeyboardEvent, listbox: ReturnType<typeof createListbox>): boolean {
  if (event.key !== 'Escape' || !listbox.isOpen()) return false;
  event.preventDefault();
  listbox.close();
  return true;
}

function createComparisonStore(doc: Document, win: Window, catalog: string[]) {
  const detailsBase =
    doc.querySelector<HTMLElement>('#themes-data')?.dataset.detailsBase ?? 'theme-data/';
  return createActiveThemeStore({
    fetcher: (url) => win.fetch(url),
    baseUrl: new URL(detailsBase, doc.baseURI),
    knownSlugs: catalog,
    search: () => win.location.search,
  });
}

function wireFocusEffects(c: Controls, effects: ReturnType<typeof createEffects>): void {
  for (const event of ['focusin', 'focusout'])
    c.doc.addEventListener(
      event,
      (ev) => {
        if (effects.state().role !== 'focus') return;
        const target = ev.target;
        if (target instanceof Node && effects.panes.some((pane) => pane.root.contains(target)))
          refreshEffects(effects);
      },
      { signal: c.signal },
    );
}
