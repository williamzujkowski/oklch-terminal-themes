export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface ColorValue {
  hex: string;
  oklch: Oklch;
  oklchCss: string;
}

export const COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selection',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'purple',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightPurple',
  'brightCyan',
  'brightWhite',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export type Colors = Record<ColorKey, ColorValue>;

/**
 * WCAG 2.x contrast summary for a theme.
 *
 * - `fgOnBg` is the body-text contrast (foreground vs background).
 * - `minAnsi` is the worst-case contrast of any ANSI-palette slot against the
 *   background, EXCLUDING the slot that is supposed to blend with the
 *   background by design (`black` + `brightBlack` on dark themes, `white` +
 *   `brightWhite` on light themes). Surfaces legibility problems in
 *   command-prompt output without false-flagging intentional near-bg slots.
 */
export interface Contrast {
  fgOnBg: number;
  minAnsi: number;
  minAnsiSlot: ColorKey;
}

export interface TerminalColorTheme {
  name: string;
  slug: string;
  isDark: boolean;
  tags: string[];
  /** Source id from `sources.json` — kebab-case, validates against the active sources config at build time. */
  source: string;
  sourceUrl: string;
  upstreamSha: string;
  updatedAt: string;
  colors: Colors;
  contrast: Contrast;
  /**
   * Slug of this theme's canonical opposite-polarity counterpart (e.g.
   * `ayu-light`'s counterpart is `ayu`), computed at build time — see
   * `src/counterpart.ts`. Directional, not necessarily involutive: several
   * dark variants in a family may point at one canonical light member while
   * that light member points back at only its canonical dark. Absent when a
   * theme has no identifiable counterpart. See issue #128.
   */
  counterpart?: string;
}

export interface SlimTheme {
  name: string;
  slug: string;
  isDark: boolean;
  contrast: Contrast;
  colors: Record<ColorKey, string>;
  /** See `TerminalColorTheme.counterpart` — directional, not necessarily involutive. */
  counterpart?: string;
}

export interface ThemeIndexEntry {
  name: string;
  slug: string;
  isDark: boolean;
  tags: string[];
  /** See `TerminalColorTheme.counterpart` — directional, not necessarily involutive. */
  counterpart?: string;
}

export interface ThemeIndex {
  generatedAt: string;
  /**
   * Per-source SHA pins, keyed by source id. Replaces the old single-source
   * `upstreamSha` field; the legacy field is kept as an alias for the primary
   * source so older consumers don't break.
   */
  upstreamShas: Record<string, string>;
  /** @deprecated Equals the first entry of `upstreamShas`. Use `upstreamShas` for multi-source. */
  upstreamSha: string;
  count: number;
  themes: ThemeIndexEntry[];
}
