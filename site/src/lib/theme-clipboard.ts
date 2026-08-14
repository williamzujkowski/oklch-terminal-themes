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

export interface ClipboardDeps {
  signal: AbortSignal;
  currentSlug: () => string;
  /** Awaits the dataset only if the theme is not already loaded (#211). */
  resolve: (slug: string) => Promise<SlimTheme | undefined>;
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
function toast(doc: Document, win: Window, message: string): void {
  const el = doc.querySelector<HTMLElement>('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.dataset.visible = 'true';
  win.setTimeout(() => {
    el.dataset.visible = 'false';
  }, 1800);
}

/** The export menu's own feedback, rendered on the <summary>. */
function flashExport(doc: Document, win: Window, msg: string, ok: boolean): void {
  const summary = doc.querySelector<HTMLElement>('.export-menu summary');
  if (!summary) return;
  summary.dataset.feedback = msg;
  summary.dataset.feedbackOk = ok ? 'true' : 'false';
  win.setTimeout(() => {
    delete summary.dataset.feedback;
    delete summary.dataset.feedbackOk;
  }, 1800);
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
function bindCopy(
  el: HTMLElement,
  deps: ClipboardDeps,
  win: Window,
  pick: (theme: SlimTheme, slug: string) => string | undefined,
  report: (value: string, ok: boolean) => void,
): void {
  el.addEventListener(
    'click',
    async () => {
      const slug = deps.currentSlug();
      const theme = await deps.resolve(slug);
      if (!theme) return;
      const value = pick(theme, slug);
      if (value === undefined) return;
      report(value, await copy(win, value));
    },
    { signal: deps.signal },
  );
}

function wireExportMenu(doc: Document, win: Window, deps: ClipboardDeps): void {
  for (const btn of doc.querySelectorAll<HTMLButtonElement>('[data-export]')) {
    const action = btn.dataset.export;
    bindCopy(
      btn,
      deps,
      win,
      (theme, slug) => exportText(win, action, theme, slug),
      (_value, ok) => {
        const what = action === 'permalink' ? 'permalink' : (action ?? '');
        flashExport(doc, win, ok ? `copied ${what}` : 'clipboard blocked', ok);
        // Close the <details>.
        const details = btn.closest<HTMLDetailsElement>('details');
        if (details) details.open = false;
      },
    );
  }
}

function wireSwatches(doc: Document, win: Window, deps: ClipboardDeps): void {
  const report = (value: string, ok: boolean): void => {
    toast(doc, win, ok ? `copied ${value}` : 'clipboard blocked');
  };
  for (const chip of doc.querySelectorAll<HTMLButtonElement>('.palette-chip')) {
    bindCopy(chip, deps, win, (theme) => theme.colors[chip.dataset.key ?? ''] || undefined, report);
  }
  // Dataviz swatch copy (issue #158) — same toast as the palette chips.
  for (const chip of doc.querySelectorAll<HTMLButtonElement>('.viz-chip')) {
    bindCopy(
      chip,
      deps,
      win,
      (theme) => theme.dataviz?.categorical[Number.parseInt(chip.dataset.vizSwatch ?? '-1', 10)],
      report,
    );
  }
}

export function wireClipboard(doc: Document, win: Window, deps: ClipboardDeps): void {
  wireExportMenu(doc, win, deps);
  wireSwatches(doc, win, deps);
}
