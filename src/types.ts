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

/**
 * A theme's derived data-visualization palette (issue #150): pure functions
 * over `colors` + `accent`, computed at build time by `src/dataviz.ts`.
 *
 * - `categorical` — 6-8 colors selected from the theme's 12 chromatic ANSI
 *   slots (the 6 classic + 6 bright colors; `black`/`white`/`brightBlack`/
 *   `brightWhite` are excluded as non-chromatic), ordered starting from the
 *   accent hue for adjacent-distinguishability (Carbon/Observable
 *   categorical-palette convention). Each entry is a REFERENCE to its source
 *   slot's own color, same convention as `Accent`.
 * - `sequential` — a 7-step OKLCH interpolation from `background` to
 *   `accent`, gamut-fit per step. These are newly DERIVED colors (not
 *   references) — `hex` is gamut-clamped, `oklch`/`oklchCss` carry the
 *   interpolated values, same authored-oklch convention as
 *   `convertOklchToColor` (issue #132).
 * - `diverging` — a 7-step ramp with the accent hue on one arm and the
 *   categorical hue farthest from it on the other, meeting at a
 *   near-achromatic midpoint. Also newly derived colors.
 *
 * See `src/dataviz.ts` for the full derivation algorithm and rationale.
 */
export interface Dataviz {
  categorical: ColorValue[];
  sequential: ColorValue[];
  diverging: ColorValue[];
}

/**
 * Slim projection of `Dataviz` — categorical only, as `oklchCss` strings
 * (mirrors how `AccentSlim` trims `Accent` down to `source` + `oklchCss`).
 * `sequential`/`diverging` are omitted from the slim projection: they're
 * bulkier (7 colors each) and less commonly needed client-side than a quick
 * categorical swatch set.
 */
export interface DatavizSlim {
  categorical: string[];
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
  /** See `Dataviz` above. Absent only for data built before this field existed. */
  dataviz?: Dataviz;
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
  /** See `DatavizSlim` — categorical-only projection of `Dataviz`. */
  dataviz?: DatavizSlim;
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
