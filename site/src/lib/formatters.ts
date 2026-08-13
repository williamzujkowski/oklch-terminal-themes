// Format helpers for the actions panel. Pure; both client and server can call them.

export interface SlimThemeLike {
  name: string;
  slug: string;
  isDark: boolean;
  contrast?: { fgOnBg: number; minAnsi: number; minAnsiSlot: string };
  colors: Record<string, string>;
}

/**
 * Neutralises a CSS comment terminator so a theme name cannot break out of the
 * `/* ... *\/` header the export formatters emit.
 *
 * Found by @devmaster1987 in #235: `formatCssVars` and `formatTailwindTheme`
 * both interpolate `theme.name` straight into a comment, so a name containing
 * `*` + `/` would close the comment early and everything after it would be
 * parsed as CSS. #247 escaped the same sink in `src/css-export.ts` (the
 * generated `data/css/*.css`) but missed these two, which are the ones a user
 * actually triggers by clicking "copy CSS" or "copy Tailwind".
 *
 * `ThemeNameSchema` (#232) already excludes `*` from the permitted charset, so
 * once that lands nothing reaching here can contain the sequence. This is the
 * second layer: the sink stays safe even if the schema is later relaxed, which
 * is the ordering #189 asks for — close the class at the source AND at the
 * sink.
 *
 * Duplicated rather than imported from the package for the same reason as
 * `kebab` below: this module is pulled into the client bundle, and importing
 * the package entrypoint drags `culori`, `apca-w3` and `zod` in with it.
 */
export function escapeCssComment(text: string): string {
  return text.replace(/\*\//g, '*\\/');
}

/**
 * camelCase colour key -> kebab-case CSS custom-property fragment.
 *
 * The package exports an identical `toKebabCase`, and importing it from there
 * would be the obvious dedupe — but this module is pulled into the CLIENT
 * bundle by the showcase controller, and importing the package entrypoint
 * drags `culori`, `apca-w3` and `zod` in with it. Measured: the `_astro`
 * bundle goes 44,639 -> 157,184 bytes. So the site keeps its own copy, and
 * every other site module imports THIS one rather than re-declaring the
 * regex (#229).
 *
 * `sideEffects: false` has since landed on the package, so a tree shaker
 * should now drop the unused surface — re-measure the bundle before
 * switching to the package export.
 */
export function toKebabCase(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Maps a foreground-vs-background contrast ratio to the WCAG 2.x body-text
 * tier. Values mirror the package's exported `WCAG_THRESHOLDS`; a test pins
 * them together so the UI badge and the tag filters cannot drift (#229).
 */
export function wcagLabel(fgOnBg: number): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  if (fgOnBg >= 7) return 'AAA';
  if (fgOnBg >= 4.5) return 'AA';
  if (fgOnBg >= 3) return 'AA Large';
  return 'Fail';
}

/**
 * Contrast ratio for badge display, e.g. "8.2:1" — rounded DOWN.
 *
 * `toFixed(1)` rounds half-up, which lets a value display as clearing a
 * conformance threshold it actually fails: `mirage`'s 6.9952 rendered as
 * "7.0:1" directly beside an AA (not AAA) badge, and 15 published values
 * across 14 themes did the same on one of `fgOnBg` / `cursorOnBg` /
 * `selectionContrast` (#201).
 *
 * Flooring is the standard treatment for a conformance figure: a displayed
 * ratio should never claim more than the underlying value supports. The
 * dataset itself stores raw unrounded floats and every tag comparison uses
 * them, so this was always display-only — but "7.0:1" next to a badge saying
 * the theme is not AAA is exactly the kind of contradiction that makes a
 * reader distrust the rest of the numbers.
 */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
}

function kebab(key: string): string {
  return toKebabCase(key);
}

/**
 * Emits the theme as a `:root` CSS block with `--terminal-<key>` custom
 * properties. Mirrors the package's `themeToCssVars` but wraps in `:root`.
 */
export function formatCssVars(theme: SlimThemeLike): string {
  const lines = Object.entries(theme.colors).map(([k, v]) => `  --terminal-${kebab(k)}: ${v};`);
  return `/* ${escapeCssComment(theme.name)} — oklch-terminal-themes */\n:root {\n${lines.join('\n')}\n}\n`;
}

/**
 * Emits a Tailwind v4 `@theme` block mapping the 20 theme slots to
 * `--color-terminal-<key>` custom properties Tailwind picks up automatically.
 */
export function formatTailwindTheme(theme: SlimThemeLike): string {
  const lines = Object.entries(theme.colors).map(
    ([k, v]) => `  --color-terminal-${kebab(k)}: ${v};`,
  );
  return `/* ${escapeCssComment(theme.name)} — Tailwind v4 */\n@theme {\n${lines.join('\n')}\n}\n`;
}

export function formatJson(theme: SlimThemeLike): string {
  return `${JSON.stringify(theme, null, 2)}\n`;
}

/**
 * Build an absolute URL for the current page with `?theme=<slug>` set so the
 * user can share the selection.
 */
export function formatPermalink(slug: string, base: URL): string {
  const url = new URL(base.href);
  url.searchParams.set('theme', slug);
  return url.toString();
}
