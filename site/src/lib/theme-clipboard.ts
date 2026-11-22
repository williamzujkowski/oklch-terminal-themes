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
import { formatRecipeCss, type Recipe } from './application-roles';
import type { ThemeDetailsRecord } from './theme-details';
type Scope = Document | HTMLElement;

export interface ClipboardDeps {
  signal: AbortSignal;
  currentSlug: () => string;
  /** Awaits the dataset only if the theme is not already loaded (#211). */
  resolve: (slug: string) => Promise<SlimTheme | undefined>;
  resolveFull?: (slug: string) => Promise<ThemeDetailsRecord | undefined>;
  recipe?: () => Recipe;
  label?: string;
}
interface CopyContext {
  deps: ClipboardDeps;
  generation: number;
  timers: Map<number, () => void>;
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
  const owner = doc instanceof Document ? doc : doc.ownerDocument;
  const el =
    doc.querySelector<HTMLElement>('[data-toast]') ??
    owner.querySelector<HTMLElement>('[data-toast]');
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
  const announcer =
    doc.querySelector<HTMLElement>('[data-theme-announcer]') ??
    owner.querySelector<HTMLElement>('[data-theme-announcer]');
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

async function fullExport(action: string, slug: string, deps: ClipboardDeps): Promise<string> {
  const recipe = deps.recipe?.() ?? 'raw';
  const full = await deps.resolveFull?.(slug);
  if (!full || full.slug !== slug) throw new Error('Theme data unavailable');
  return action === 'full-json'
    ? `${JSON.stringify(full, null, 2)}\n`
    : formatRecipeCss(full, recipe);
}

async function exportText(
  win: Window,
  action: string | undefined,
  theme: SlimTheme,
  slug: string,
  deps: ClipboardDeps,
): Promise<string | undefined> {
  if (action === 'full-json' || action === 'recipe-css') return fullExport(action, slug, deps);
  if (action === 'css') return formatCssVars(theme);
  if (action === 'tailwind') return formatTailwindTheme(theme);
  if (action === 'json') return formatJson(theme);
  if (action === 'permalink') {
    // origin + pathname only, never the full href: `location.href` carries
    // whatever ?q=/?tags=/?sort= the sender happened to have, so a shared
    // link silently opened a filtered view the recipient never chose (#219).
    return formatPermalink(slug, new URL(win.location.pathname, win.location.origin));
  }
  return undefined;
}

/**
 * Wires one control to "resolve the current theme, produce a string from it,
 * copy, report".
 *
 * `pick` returning undefined means there is nothing to copy and the click is
 * a no-op — which is the correct behaviour for a palette chip whose key is
 * missing, or a dataviz swatch past this theme's categorical length.
 */
function clearFeedback(win: Window, context: CopyContext): void {
  for (const [timer, clear] of context.timers) {
    win.clearTimeout(timer);
    clear();
  }
  context.timers.clear();
}
function later(win: Window, context: CopyContext, clear: () => void): void {
  const generation = context.generation;
  const timer = win.setTimeout(() => {
    context.timers.delete(timer);
    if (!context.deps.signal.aborted && generation === context.generation) clear();
  }, 1800);
  context.timers.set(timer, clear);
}
function bindCopy(
  el: HTMLElement,
  context: CopyContext,
  win: Window,
  pick: (theme: SlimTheme, slug: string) => string | undefined | Promise<string | undefined>,
  report: (value: string, ok: boolean, theme?: SlimTheme, failure?: string) => void,
): void {
  const deps = context.deps;
  el.addEventListener(
    'click',
    async () => {
      clearFeedback(win, context);
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
        const value = await pick(theme, slug);
        if (value === undefined || !current()) return;
        const ok = await copy(win, value);
        if (current()) report(value, ok, theme);
      } catch {
        if (current()) report('', false, undefined, 'export unavailable');
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
      (theme, slug) => exportText(win, action, theme, slug, deps),
      (_value, ok, theme, failure) => {
        const what = action === 'permalink' ? 'permalink' : (action ?? '');
        const prefix = deps.label ? `${deps.label} · ${theme?.name ?? deps.currentSlug()}: ` : '';
        flashExport(
          doc,
          win,
          `${prefix}${ok ? `copied ${what}` : (failure ?? 'clipboard blocked')}`,
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
  const report = (value: string, ok: boolean, theme?: SlimTheme, failure?: string): void => {
    const prefix = context.deps.label
      ? `${context.deps.label} · ${theme?.name ?? context.deps.currentSlug()}: `
      : '';
    toast(
      doc,
      win,
      `${prefix}${ok ? `copied ${value}` : (failure ?? 'clipboard blocked')}`,
      context,
    );
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
  const context: CopyContext = { deps, generation: 0, timers: new Map() };
  deps.signal.addEventListener(
    'abort',
    () => {
      context.generation++;
      clearFeedback(win, context);
    },
    { once: true },
  );
  wireExportMenu(doc, win, context);
  wireSwatches(doc, win, context);
}
