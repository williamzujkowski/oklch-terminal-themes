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
