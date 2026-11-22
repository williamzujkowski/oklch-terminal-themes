// Copy-to-clipboard for the export menu, the palette chips and the dataviz
// swatches.
//
// Extracted from `showcase-controller.ts` (issue #286). The three handlers
// were near-identical — resolve the current theme, pick a string off it, copy
// it, show feedback — with the resolve-and-await comment duplicated verbatim
// three times. They now share `copy`, `toast` and `bindCopy`, so the
// per-control difference is just which string is produced.

import { formatCssVars, formatTailwindTheme, formatJson, formatPermalink } from './formatters';
import type { SlimTheme } from './theme-store';
import type { Recipe } from './application-roles';
type Scope = Document | HTMLElement;

export interface ClipboardDeps {
  signal: AbortSignal;
  currentSlug: () => string;
  /** Awaits the dataset only if the theme is not already loaded (#211). */
  resolve: (slug: string) => Promise<SlimTheme | undefined>;
  recipe?: () => Recipe;
  label?: string;
}
interface CopyContext {
  deps: ClipboardDeps;
  generation: number;
  timers: Set<number>;
}

async function copy(win: Window, text: string): Promise<boolean> {
  if (!win.navigator.clipboard) return false;
  try {
    await win.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The transient toast shared by the palette chips and dataviz swatches. */
function toast(doc: Scope, win: Window, message: string, context: CopyContext): void {
  const el = doc.querySelector<HTMLElement>('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.dataset.visible = 'true';
  later(win, context, () => {
    el.dataset.visible = 'false';
  });
}

/**
 * The export menu's own feedback, rendered on the <summary>. That chip is a
 * data attribute painted by CSS, which screen readers never hear, so the
 * message also goes to the shared role="status" announcer.
 */
function flashExport(
  doc: Scope,
  win: Window,
  msg: string,
  ok: boolean,
  context: CopyContext,
): void {
  const owner = doc instanceof Document ? doc : doc.ownerDocument;
  const announcer = owner.querySelector<HTMLElement>('[data-theme-announcer]');
  if (announcer) announcer.textContent = msg;
  const summary = doc.querySelector<HTMLElement>('.export-menu summary');
  if (!summary) return;
  summary.dataset.feedback = msg;
  summary.dataset.feedbackOk = ok ? 'true' : 'false';
  later(win, context, () => {
    delete summary.dataset.feedback;
    delete summary.dataset.feedbackOk;
  });
}

function exportText(
  win: Window,
  action: string | undefined,
  theme: SlimTheme,
  slug: string,
): string {
  if (action === 'css') return formatCssVars(theme);
  if (action === 'tailwind') return formatTailwindTheme(theme);
  if (action === 'json') return formatJson(theme);
  if (action === 'permalink') {
    // origin + pathname only, never the full href: `location.href` carries
    // whatever ?q=/?tags=/?sort= the sender happened to have, so a shared
    // link silently opened a filtered view the recipient never chose (#219).
    return formatPermalink(slug, new URL(win.location.pathname, win.location.origin));
  }
  return '';
}

/**
 * Wires one control to "resolve the current theme, produce a string from it,
 * copy, report".
 *
 * `pick` returning undefined means there is nothing to copy and the click is
 * a no-op — which is the correct behaviour for a palette chip whose key is
 * missing, or a dataviz swatch past this theme's categorical length.
 */
function later(win: Window, context: CopyContext, clear: () => void): void {
  const generation = context.generation;
  const timer = win.setTimeout(() => {
    context.timers.delete(timer);
    if (!context.deps.signal.aborted && generation === context.generation) clear();
  }, 1800);
  context.timers.add(timer);
}
function bindCopy(
  el: HTMLElement,
  context: CopyContext,
  win: Window,
  pick: (theme: SlimTheme, slug: string) => string | undefined,
  report: (value: string, ok: boolean, theme?: SlimTheme) => void,
): void {
  const deps = context.deps;
  el.addEventListener(
    'click',
    async () => {
      const generation = ++context.generation;
      const slug = deps.currentSlug();
      const recipe = deps.recipe?.() ?? 'raw';
      const current = (): boolean =>
        !deps.signal.aborted &&
        generation === context.generation &&
        slug === deps.currentSlug() &&
        recipe === (deps.recipe?.() ?? 'raw');
      try {
        const theme = await deps.resolve(slug);
        if (!theme || !current()) return;
        const value = pick(theme, slug);
        if (value === undefined) return;
        const ok = await copy(win, value);
        if (current()) report(value, ok, theme);
      } catch {
        if (current()) report('', false);
      }
    },
    { signal: deps.signal },
  );
}

function wireExportMenu(doc: Scope, win: Window, context: CopyContext): void {
  const deps = context.deps;
  for (const btn of doc.querySelectorAll<HTMLButtonElement>('[data-export]')) {
    const action = btn.dataset.export;
    bindCopy(
      btn,
      context,
      win,
      (theme, slug) => exportText(win, action, theme, slug),
      (_value, ok, theme) => {
        const what = action === 'permalink' ? 'permalink' : (action ?? '');
        const prefix = deps.label ? `${deps.label} · ${theme?.name ?? deps.currentSlug()}: ` : '';
        flashExport(
          doc,
          win,
          `${prefix}${ok ? `copied ${what}` : 'clipboard blocked'}`,
          ok,
          context,
        );
        // Close the <details>.
        const details = btn.closest<HTMLDetailsElement>('details');
        if (details) details.open = false;
      },
    );
  }
}

function wireSwatches(doc: Scope, win: Window, context: CopyContext): void {
  const report = (value: string, ok: boolean): void => {
    toast(doc, win, ok ? `copied ${value}` : 'clipboard blocked', context);
  };
  for (const chip of doc.querySelectorAll<HTMLButtonElement>('.palette-chip')) {
    bindCopy(
      chip,
      context,
      win,
      (theme) => theme.colors[chip.dataset.key ?? ''] || undefined,
      report,
    );
  }
  // Dataviz swatch copy (issue #158) — same toast as the palette chips.
  for (const chip of doc.querySelectorAll<HTMLButtonElement>('.viz-chip')) {
    bindCopy(
      chip,
      context,
      win,
      (theme) => theme.dataviz?.categorical[Number.parseInt(chip.dataset.vizSwatch ?? '-1', 10)],
      report,
    );
  }
}

export function wireClipboard(doc: Scope, win: Window, deps: ClipboardDeps): void {
  const context: CopyContext = { deps, generation: 0, timers: new Set() };
  deps.signal.addEventListener(
    'abort',
    () => {
      context.generation++;
      for (const timer of context.timers) win.clearTimeout(timer);
      context.timers.clear();
    },
    { once: true },
  );
  wireExportMenu(doc, win, context);
  wireSwatches(doc, win, context);
}
