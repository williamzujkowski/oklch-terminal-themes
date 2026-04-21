// Format helpers for the actions panel. Pure; both client and server can call them.

export interface SlimThemeLike {
  name: string;
  slug: string;
  isDark: boolean;
  contrast?: { fgOnBg: number; minAnsi: number; minAnsiSlot: string };
  colors: Record<string, string>;
}

/**
 * Maps a foreground-vs-background contrast ratio to the WCAG 2.x body-text
 * tier. Mirrors the thresholds used in src/classify.ts so the UI badge and
 * the tag filters stay in lockstep.
 */
export function wcagLabel(fgOnBg: number): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  if (fgOnBg >= 7) return 'AAA';
  if (fgOnBg >= 4.5) return 'AA';
  if (fgOnBg >= 3) return 'AA Large';
  return 'Fail';
}

/** Fixed-precision contrast ratio for badge display, e.g. "8.2:1". */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

function kebab(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Emits the theme as a `:root` CSS block with `--terminal-<key>` custom
 * properties. Mirrors the package's `themeToCssVars` but wraps in `:root`.
 */
export function formatCssVars(theme: SlimThemeLike): string {
  const lines = Object.entries(theme.colors).map(([k, v]) => `  --terminal-${kebab(k)}: ${v};`);
  return `/* ${theme.name} — oklch-terminal-themes */\n:root {\n${lines.join('\n')}\n}\n`;
}

/**
 * Emits a Tailwind v4 `@theme` block mapping the 20 theme slots to
 * `--color-terminal-<key>` custom properties Tailwind picks up automatically.
 */
export function formatTailwindTheme(theme: SlimThemeLike): string {
  const lines = Object.entries(theme.colors).map(
    ([k, v]) => `  --color-terminal-${kebab(k)}: ${v};`,
  );
  return `/* ${theme.name} — Tailwind v4 */\n@theme {\n${lines.join('\n')}\n}\n`;
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
