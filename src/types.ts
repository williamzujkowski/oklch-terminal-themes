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

// Valid `accent.source` values (issue #133): `cursor`, or one of the 16 ANSI
// slots. Excludes `background`, `foreground`, and `selection` — those aren't
// candidate accent sources under the heuristic or the curated override map.
function isAccentSlotKey(
  k: ColorKey,
): k is Exclude<ColorKey, 'background' | 'foreground' | 'selection'> {
  return k !== 'background' && k !== 'foreground' && k !== 'selection';
}
export const ACCENT_SLOT_KEYS = COLOR_KEYS.filter(isAccentSlotKey);

export type AccentSlotKey = (typeof ACCENT_SLOT_KEYS)[number];

/**
 * WCAG 2.x contrast summary for a theme.
 *
 * - `fgOnBg` is the body-text contrast (foreground vs background).
 * - `minAnsi` is the worst-case contrast of any ANSI-palette slot against the
 *   background, EXCLUDING the slot that is supposed to blend with the
 *   background by design (`black` + `brightBlack` on dark themes, `white` +
 *   `brightWhite` on light themes). Surfaces legibility problems in
 *   command-prompt output without false-flagging intentional near-bg slots.
 *
 * The remaining fields are optional/additive (issue #145) — absent for data
 * built before they existed:
 *
 * - `cursorOnBg` — cursor vs background. A non-text UI element, so WCAG
 *   1.4.11 Non-text Contrast's 3:1 floor is the relevant bar, not the 4.5:1
 *   body-text threshold (see `cursor-visible` tag).
 * - `selectionContrast` — foreground vs selection-background. The schema
 *   carries no dedicated selected-text-color slot, so fg-on-selection is the
 *   meaningful "can you still read the text once it's selected?" pair,
 *   judged against the WCAG 1.4.3 AA body-text bar (4.5:1; see
 *   `selection-legible` tag).
 * - `brightnessOrdered` — true iff every `bright*` slot's OKLCH lightness
 *   exceeds its normal counterpart's, across all 8 normal/bright pairs.
 *   Real bug class: terminal emulators that map SGR bold -> bright render
 *   worse than authored when this ordering is violated (microsoft/terminal
 *   #12957/#5384, terminator #943).
 * - `brightnessViolations` — the `bright*` slot names that fail the above
 *   check; empty when `brightnessOrdered` is `true`.
 */
export interface Contrast {
  fgOnBg: number;
  minAnsi: number;
  minAnsiSlot: ColorKey;
  cursorOnBg?: number;
  selectionContrast?: number;
  brightnessOrdered?: boolean;
  brightnessViolations?: ColorKey[];
}

/**
 * A theme's computed signature/accent color (issue #133): `cursor` if it's
 * chromatic (OKLCH chroma >= 0.05), else the most-chromatic of the six
 * classic ANSI colors (`blue`, `purple`, `red`, `green`, `cyan`, `yellow`,
 * ties broken by that order). Curatable per-theme via
 * `CURATED_ACCENT_OVERRIDES` in `src/accent.ts` for themes where the
 * heuristic picks wrong. The value is a REFERENCE to the chosen slot's own
 * `hex`/`oklch`/`oklchCss` — never a newly derived color — so
 * `scripts/validate.ts` can assert exact equality against `colors[source]`.
 */
export interface Accent {
  source: AccentSlotKey;
  hex: string;
  oklch: Oklch;
  oklchCss: string;
}

/** Slim projection of `Accent` — see `SlimTheme.accent` / `ThemeIndexEntry.accent`. */
export interface AccentSlim {
  source: AccentSlotKey;
  oklchCss: string;
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
  /**
   * Color keys whose `colors[key]` was authored directly in OKLCH by a native
   * (`data-sources/native/*.json`) source file, rather than derived from hex.
   * For these slots `hex` is the DERIVED field (gamut-clamped) and
   * `colors[key].oklch` carries the authored numbers verbatim — see issue
   * #132. Omitted (or empty) for themes with no OKLCH-authored slots, which
   * is every non-native theme plus any hex-only native theme. Absent from
   * `SlimTheme` / `ThemeIndexEntry` — it's build-time provenance for
   * `scripts/validate.ts`'s round-trip check, not a display concern.
   */
  oklchAuthored?: ColorKey[];
  /** See `Accent` above. Absent only for data built before this field existed. */
  accent?: Accent;
}

export interface SlimTheme {
  name: string;
  slug: string;
  isDark: boolean;
  contrast: Contrast;
  colors: Record<ColorKey, string>;
  /** See `TerminalColorTheme.counterpart` — directional, not necessarily involutive. */
  counterpart?: string;
  /** See `Accent` — slim projection (`source` + `oklchCss` only). */
  accent?: AccentSlim;
}

export interface ThemeIndexEntry {
  name: string;
  slug: string;
  isDark: boolean;
  tags: string[];
  /** See `TerminalColorTheme.counterpart` — directional, not necessarily involutive. */
  counterpart?: string;
  /** See `Accent` — slim projection (`source` + `oklchCss` only). */
  accent?: AccentSlim;
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
