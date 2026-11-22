import { createPreviewPainter, paintCandidatePicker } from './theme-paint';
import {
  createThemeSelection,
  type ThemeSelection,
  type ThemeSelectionStatus,
} from './theme-selection';
import type { ThemeStore } from './theme-store';
import type { ExplorerState } from './explorer-state';
import { applyRoleMappings } from './application-roles';
import { paintThemeSummary } from './theme-summary';

export interface Preview {
  id: 'a' | 'b';
  root: HTMLElement;
  selection: ThemeSelection;
  slug: string;
  phase: ThemeSelectionStatus['phase'];
}
interface PreviewOptions {
  doc: Document;
  store: ThemeStore;
  signal: AbortSignal;
  changed: () => void;
}
function feedback(pane: Preview, status: ThemeSelectionStatus): void {
  pane.phase = status.phase;
  const ready = status.phase === 'ready';
  pane.root.setAttribute('aria-busy', String(status.phase === 'loading'));
  const region = pane.root.querySelector<HTMLElement>('[data-pane-status]');
  if (region) {
    region.hidden = ready;
    const previous = status.paintedTheme ? ` Showing ${status.paintedTheme.name}.` : '';
    region.textContent = `${pane.id.toUpperCase()} · ${status.phase === 'loading' ? 'Loading' : 'Unable to load'} ${status.requestedSlug}.${previous}`;
  }
  const retry = pane.root.querySelector<HTMLButtonElement>('[data-pane-retry]');
  if (retry) retry.hidden = status.phase !== 'error';
  for (const button of pane.root.querySelectorAll<HTMLButtonElement>(
    '[data-export], .palette-chip, .viz-chip',
  ))
    button.disabled = !ready;
}
export function createPreview(
  root: HTMLElement,
  id: Preview['id'],
  options: PreviewOptions,
): Preview {
  const pane: Preview = { id, root, slug: '', phase: 'loading', selection: undefined! };
  const paint = createPreviewPainter(root);
  pane.selection = createThemeSelection({
    store: options.store,
    signal: options.signal,
    paint: (theme) => {
      paint(theme);
      root.dataset.themeSlug = theme.slug;
      const details = options.store.details?.(theme.slug);
      if (details) paintThemeSummary(root, details);
      if (id === 'b') paintCandidatePicker(options.doc, theme);
    },
    onStatus: (status) => {
      feedback(pane, status);
      options.changed();
    },
  });
  root
    .querySelector('[data-pane-retry]')
    ?.addEventListener('click', () => pane.selection.retry(), { signal: options.signal });
  return pane;
}
export function presentPreview(pane: Preview, state: ExplorerState): void {
  const slug = pane.id === 'a' ? state.reference : state.theme;
  pane.root.hidden = slug === null;
  if (slug === null) {
    pane.slug = '';
    return;
  }
  pane.root.style.setProperty('--specimen-size', `${state.size}px`);
  applyRoleMappings(pane.root, state.recipe);
  for (const specimen of pane.root.querySelectorAll<HTMLElement>('[data-specimen]'))
    specimen.hidden = state.view !== 'all' && specimen.dataset.specimen !== state.view;
  for (const scenario of pane.root.querySelectorAll<HTMLElement>('[data-scenario]'))
    scenario.hidden = scenario.dataset.scenario !== state.sample;
  if (pane.slug === slug) return;
  pane.slug = slug;
  pane.selection.select(slug);
}
