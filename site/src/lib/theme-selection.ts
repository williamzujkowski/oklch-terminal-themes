// Each preview owns a request generation; the underlying catalog fetch is shared.
import type { SlimTheme, ThemeStore } from './theme-store';

export interface ThemeSelectionStatus {
  phase: 'loading' | 'ready' | 'error';
  requestedSlug: string;
  paintedTheme: SlimTheme | undefined;
}

interface SelectionOptions {
  store: ThemeStore;
  paint: (theme: SlimTheme) => void;
  onStatus: (status: ThemeSelectionStatus) => void;
  signal: AbortSignal;
}

interface SelectionState {
  options: SelectionOptions;
  generation: number;
  status: ThemeSelectionStatus;
}

export interface ThemeSelection {
  select(slug: string): void;
  retry(): void;
  /** Only the ready, currently painted identity is exportable. */
  resolveForExport(slug: string): Promise<SlimTheme | undefined>;
}

function publish(s: SelectionState, phase: ThemeSelectionStatus['phase']): void {
  s.status = { ...s.status, phase };
  s.options.onStatus(s.status);
}

function finish(s: SelectionState, generation: number, theme: SlimTheme | undefined): void {
  if (s.options.signal.aborted || generation !== s.generation) return;
  if (!theme) {
    publish(s, 'error');
    return;
  }
  s.status = { ...s.status, paintedTheme: theme };
  s.options.paint(theme);
  publish(s, 'ready');
}

function select(s: SelectionState, slug: string): void {
  if (s.options.signal.aborted) return;
  const generation = ++s.generation;
  s.status = { ...s.status, requestedSlug: slug };
  const known = s.options.store.peek(slug);
  if (known) {
    finish(s, generation, known);
    return;
  }
  if (!s.status.paintedTheme) {
    const fallback = s.options.store.peek();
    if (fallback) {
      s.status = { ...s.status, paintedTheme: fallback };
      s.options.paint(fallback);
    }
  }
  publish(s, 'loading');
  void s.options.store.resolve(slug).then(
    (theme) => {
      finish(s, generation, theme);
    },
    () => {
      finish(s, generation, undefined);
    },
  );
}

export function createThemeSelection(options: SelectionOptions): ThemeSelection {
  const s: SelectionState = {
    options,
    generation: 0,
    status: { phase: 'loading', requestedSlug: '', paintedTheme: undefined },
  };
  return {
    select: (slug) => {
      select(s, slug);
    },
    retry: () => {
      select(s, s.status.requestedSlug);
    },
    resolveForExport: async (slug) => {
      await Promise.resolve();
      if (options.signal.aborted || s.status.phase !== 'ready') return undefined;
      return s.status.requestedSlug === slug ? s.status.paintedTheme : undefined;
    },
  };
}

interface SelectionFeedback {
  doc: Document;
  region: HTMLElement;
  message: HTMLElement;
  retry: HTMLButtonElement;
}

function updateFeedback(ui: SelectionFeedback, status: ThemeSelectionStatus): void {
  const ready = status.phase === 'ready';
  ui.region.hidden = ready;
  ui.retry.hidden = status.phase !== 'error';
  ui.doc.querySelector('.showcase')?.setAttribute('aria-busy', String(status.phase === 'loading'));
  for (const button of ui.doc.querySelectorAll<HTMLButtonElement>(
    '[data-export], .palette-chip, .viz-chip',
  )) {
    button.disabled = !ready;
  }
  if (ready) return;
  const option = Array.from(ui.doc.querySelectorAll<HTMLElement>('.listbox-item')).find(
    (item) => item.dataset.slug === status.requestedSlug,
  );
  const name = option?.dataset.name ?? status.requestedSlug;
  const action = status.phase === 'loading' ? 'Loading' : 'Unable to load';
  const previous = status.paintedTheme ? ` Showing ${status.paintedTheme.name}.` : '';
  ui.message.textContent = `${action} ${name}.${previous} `;
  ui.retry.textContent = `Retry loading ${name}`;
}

/** Neutral, visible feedback outside the retained palette preview. */
export function createSelectionFeedback(
  doc: Document,
  signal: AbortSignal,
  retry: () => void,
): (status: ThemeSelectionStatus) => void {
  const region = doc.createElement('p');
  region.dataset.themeLoading = '';
  region.setAttribute('role', 'status');
  const message = doc.createElement('span');
  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset.action = 'retry-theme';
  button.addEventListener('click', retry, { signal });
  region.append(message, button);
  doc.querySelector('.showcase')?.before(region);
  signal.addEventListener('abort', () => region.remove(), { once: true });
  return (status) => {
    updateFeedback({ doc, region, message, retry: button }, status);
  };
}
