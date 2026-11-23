import type { ExplorerState } from './explorer-state';
import { serializeComparisonLink } from './explorer-state';
import { syncPageLinks, themeShareUrl } from './page-state';
import type { Preview } from './comparison-preview';
import type { ThemeStore } from './theme-store';

interface Effects {
  doc: Document;
  win: Window;
  store: ThemeStore;
  signal: AbortSignal;
  panes: Preview[];
  state: () => ExplorerState;
  selectedSeries: number;
  generation: number;
}
export function refreshEffects(e: Effects): void {
  const generation = ++e.generation;
  paintMobileNames(e);
  syncPageLinks(e.doc, e.state());
  const state = e.state();
  const inspector = e.doc.querySelector<HTMLElement>('[data-role-inspector]');
  if (inspector && !state.role) inspector.hidden = true;
  for (const button of e.doc.querySelectorAll<HTMLButtonElement>(
    '[data-copy-theme], [data-copy-comparison]',
  ))
    button.disabled = e.panes.some(
      (p) =>
        (button.hasAttribute('data-copy-comparison') ? !p.root.hidden : p.id === 'b') &&
        p.phase !== 'ready',
    );
  const pin = e.doc.querySelector<HTMLButtonElement>('[data-pin]');
  if (pin)
    pin.disabled = !e.panes.some(
      (p) => p.id === 'b' && p.phase === 'ready' && p.slug === state.theme,
    );
  void paintEffects(e, state, generation, inspector);
}
async function paintEffects(
  e: Effects,
  state: ExplorerState,
  generation: number,
  inspector: HTMLElement | null,
): Promise<void> {
  if (state.view === 'dataviz' || state.view === 'all') {
    const { paintCharts } = await import('./chart-paint');
    if (generation !== e.generation || e.signal.aborted) return;
    paintReadyCharts(e, paintCharts);
  }
  if (!inspector || !needsInspector(state, inspector)) return;
  if (state.role) inspector.dataset.inspectorInitialized = '';
  const { paintRoleInspector } = await import('./role-inspector');
  if (generation !== e.generation || e.signal.aborted) return;
  await paintRoleInspector(inspector, {
    isCurrent: () => generation === e.generation && !e.signal.aborted,
    role: state.role,
    recipe: state.recipe,
    view: state.view,
    size: state.size,
    panes: e.panes
      .filter((p) => !p.root.hidden)
      .map((p) => ({ id: p.id, root: p.root, phase: p.phase, theme: e.store.details?.(p.slug) })),
  });
}

export function wireShares(e: Effects): void {
  for (const button of e.doc.querySelectorAll<HTMLButtonElement>(
    '[data-copy-theme], [data-copy-comparison]',
  ))
    button.addEventListener(
      'click',
      () => {
        if (button.disabled) return;
        const state = e.state();
        const url = new URL(e.win.location.href);
        const link = button.hasAttribute('data-copy-comparison')
          ? serializeComparisonLink(state, url)
          : themeShareUrl(e.doc, state, url);
        void copyLink(
          e,
          link.href,
          button.hasAttribute('data-copy-comparison') ? 'Comparison link' : 'Theme link',
        );
      },
      { signal: e.signal },
    );
}
async function copyLink(e: Effects, link: string, label: string): Promise<void> {
  let message = `${label} copied.`;
  try {
    await e.win.navigator.clipboard.writeText(link);
  } catch {
    message = 'Clipboard unavailable. Copy this link: ' + link;
  }
  if (e.signal.aborted) return;
  const region = e.doc.querySelector('[data-explorer-notice]');
  if (region) region.textContent = message;
}
export function createEffects(options: Omit<Effects, 'generation' | 'selectedSeries'>): Effects {
  return { ...options, generation: 0, selectedSeries: 0 };
}

function paintReadyCharts(e: Effects, paint: typeof import('./chart-paint').paintCharts): void {
  for (const pane of e.panes) {
    const theme = e.store.details?.(pane.slug);
    if (theme && pane.phase === 'ready') paint(pane.root, theme, e.selectedSeries);
  }
}

function needsInspector(state: ExplorerState, inspector: HTMLElement): boolean {
  return Boolean(state.role) || inspector.hasAttribute('data-inspector-initialized');
}

function paintMobileNames(e: Effects): void {
  for (const pane of e.panes) {
    const button = e.doc.querySelector(`[data-mobile-pane="${pane.id}"]`);
    if (!button) continue;
    const name = pane.root.querySelector('[data-theme-name]')?.textContent ?? pane.slug;
    const identity = pane.id === 'a' ? 'Reference' : 'Candidate';
    const phase = pane.phase === 'ready' ? '' : ` · ${pane.phase}`;
    button.textContent = `${pane.id.toUpperCase()} · ${name} · ${identity}${phase}`;
  }
}
