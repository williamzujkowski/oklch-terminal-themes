// Paints a theme onto the showcase DOM.
//
// Extracted from `showcase-controller.ts` (issue #286), where it was one
// 61-line function at complexity 21 — almost all of it null-guarding the
// six independent regions it writes to. Splitting per region is what drops
// the complexity: each painter below guards its own root and returns, so no
// single function carries the whole guard chain.
//
// Every painter is a no-op when its region is absent, which is what lets the
// showcase render partial markup (the a11y gate samples the listbox, and the
// dataviz panel is optional).

import { formatRatio, wcagLabel, toKebabCase } from './formatters';
import type { SlimTheme } from './theme-store';

/** camelCase (colors.brightRed) → kebab (--tt-bright-red). */
function toCssVar(key: string): string {
  // The regex lives in `formatters.ts` — this was the third copy of it
  // (#229), and the extraction in #178 is what made importing it possible.
  return '--tt-' + toKebabCase(key);
}

function polarityOf(theme: SlimTheme): string {
  return theme.isDark ? 'dark' : 'light';
}

function paintIdentity(showcase: HTMLElement, theme: SlimTheme): void {
  const nameEl = showcase.querySelector<HTMLElement>('[data-theme-name]');
  const metaEl = showcase.querySelector<HTMLElement>('[data-theme-meta]');
  if (nameEl) nameEl.textContent = theme.name;
  if (metaEl) metaEl.textContent = `${polarityOf(theme)} · ${theme.slug}`;
}

function paintBadge(showcase: HTMLElement, theme: SlimTheme): void {
  const badge = showcase.querySelector<HTMLElement>('[data-wcag-badge]');
  if (!badge || !theme.contrast) return;
  const level = wcagLabel(theme.contrast.fgOnBg);
  badge.dataset.wcagLevel = level;
  const levelEl = badge.querySelector<HTMLElement>('[data-wcag-level]');
  const ratioEl = badge.querySelector<HTMLElement>('[data-wcag-ratio]');
  if (levelEl) levelEl.textContent = level;
  if (ratioEl) ratioEl.textContent = formatRatio(theme.contrast.fgOnBg);
  badge.hidden = false;
}

function paintColorVars(showcase: HTMLElement, theme: SlimTheme): void {
  for (const [k, v] of Object.entries(theme.colors)) {
    showcase.style.setProperty(toCssVar(k), v);
  }
}

function paintPalette(showcase: HTMLElement, theme: SlimTheme): void {
  const palette = showcase.querySelector<HTMLElement>('.showcase-palette');
  if (!palette) return;
  for (const chip of palette.querySelectorAll<HTMLElement>('.palette-chip')) {
    const key = chip.dataset.key ?? '';
    const valueEl = chip.querySelector<HTMLElement>('[data-value]');
    if (valueEl) valueEl.textContent = theme.colors[key] ?? '';
  }
}

function paintCombo(doc: Document, theme: SlimTheme): void {
  const combo = doc.querySelector<HTMLElement>('.combo-trigger');
  if (!combo) return;
  const label = combo.querySelector<HTMLElement>('[data-combo-label]');
  const meta = combo.querySelector<HTMLElement>('[data-combo-meta]');
  if (label) label.textContent = theme.name;
  if (meta) meta.textContent = `${polarityOf(theme)} · ${theme.slug}`;
}

/**
 * Dataviz categorical palette (issue #158).
 *
 * 6-8 stub bars/chips are pre-rendered; anything past this theme's
 * categorical length is hidden rather than removed, so switching themes never
 * has to re-create nodes.
 */
function paintDataviz(showcase: HTMLElement, theme: SlimTheme): void {
  const categorical = theme.dataviz?.categorical ?? [];

  showcase.querySelectorAll<HTMLElement>('[data-viz-bar]').forEach((bar, i) => {
    const color = categorical[i];
    if (color !== undefined) bar.style.setProperty('--viz-color', color);
    bar.hidden = color === undefined;
  });

  showcase.querySelectorAll<HTMLLIElement>('.viz-chips > li').forEach((li, i) => {
    const color = categorical[i];
    const swatch = li.querySelector<HTMLElement>('.viz-chip-swatch');
    const valueEl = li.querySelector<HTMLElement>('[data-value]');
    if (color !== undefined) {
      if (swatch) swatch.style.setProperty('--viz-color', color);
      if (valueEl) valueEl.textContent = color;
    }
    li.hidden = color === undefined;
  });
}

/**
 * Announce the active theme to assistive tech (issue #210).
 *
 * Changing the theme rewrites the heading, the meta line, the WCAG badge
 * and 20 palette values, none of which is announced — a screen-reader user
 * pressing arrow keys to browse got total silence.
 *
 * Deliberately terse: this fires on every arrow keypress, so verbosity
 * becomes noise. Contrast is included because it is the one number a user
 * is likely browsing *for*, and it uses the same rounded-down string the
 * badge shows so the two never disagree.
 *
 * Skipped on first paint — announcing the theme the page merely loaded with
 * would talk over a user who has not asked for anything yet. That "skip the
 * first one" state is why the painter is a factory rather than a bare
 * function: it has to persist across calls.
 */
function createAnnouncer(doc: Document): (theme: SlimTheme) => void {
  let hasAnnounced = false;
  return (theme) => {
    const region = doc.querySelector<HTMLElement>('[data-theme-announcer]');
    if (!region) return;
    if (!hasAnnounced) {
      hasAnnounced = true;
      return;
    }
    const contrast =
      theme.contrast === undefined
        ? ''
        : `, contrast ${formatRatio(theme.contrast.fgOnBg)} ${wcagLabel(theme.contrast.fgOnBg)}`;
    region.textContent = `${theme.name}, ${polarityOf(theme)}${contrast}`;
  };
}

/** Returns a function that paints `theme` over every showcase region. */
export function createThemePainter(doc: Document): (theme: SlimTheme) => void {
  const announce = createAnnouncer(doc);
  return (theme) => {
    const showcase = doc.querySelector<HTMLElement>('.showcase');
    if (!showcase) return;
    paintIdentity(showcase, theme);
    paintBadge(showcase, theme);
    paintColorVars(showcase, theme);
    paintPalette(showcase, theme);
    paintCombo(doc, theme);
    paintDataviz(showcase, theme);
    announce(theme);
  };
}
