import { ANSI_KEYS, DARK_BG_BLENDS, LIGHT_BG_BLENDS } from './ansi-slots.js';
import { computeApca } from './apca.js';
import { computeCvd, cvdTags } from './cvd.js';
import type { ColorKey, Colors, TerminalColorTheme } from './types.js';
import { COLOR_KEYS } from './types.js';

// ANSI_KEYS / DARK_BG_BLENDS / LIGHT_BG_BLENDS live in ansi-slots.ts — shared
// with src/apca.ts so the WCAG and APCA `minAnsi`/`minAnsiSlot` metrics walk
// the identical candidate set. See that module's doc comment.

// Normal/bright ANSI slot pairs for the brightness-monotonicity check (issue
// #145). A well-formed theme's bright variant should be strictly lighter
// (higher OKLCH L) than its normal counterpart — terminal emulators that map
// SGR bold -> bright rely on that ordering, and violations render worse than
// authored in those emulators. Real bug class: microsoft/terminal
// #12957/#5384, terminator #943.
const BRIGHTNESS_PAIRS: readonly (readonly [ColorKey, ColorKey])[] = [
  ['black', 'brightBlack'],
  ['red', 'brightRed'],
  ['green', 'brightGreen'],
  ['yellow', 'brightYellow'],
  ['blue', 'brightBlue'],
  ['purple', 'brightPurple'],
  ['cyan', 'brightCyan'],
  ['white', 'brightWhite'],
] as const;

// Substring keywords that flag a theme as "popular". Intentionally liberal —
// we'd rather over-tag than miss well-known families. Covered variants:
//  - hyphenated + non-hyphenated spellings (tokyo-night / tokyonight)
//  - sub-families (one-dark / one-half / onedark)
//  - iTerm2 prefixes (iterm2-solarized-*, iterm2-tango-*)
const POPULAR_KEYWORDS = [
  'dracula',
  'gruvbox',
  'nord',
  'solarized',
  'catppuccin',
  'tokyo-night',
  'tokyonight',
  'one-dark',
  'onedark',
  'one-half',
  'onehalf',
  'monokai',
  'rose-pine',
  'rosepine',
  'kanagawa',
  'everforest',
  'github',
  'material',
  'ayu',
  'night-owl',
  'nightowl',
  'tomorrow',
  'tango',
  'zenburn',
  'jellybeans',
  'iceberg',
  'oceanic',
  'atom-one',
  'atomone',
];

function averageChroma(colors: Colors): number {
  let sum = 0;
  for (const key of COLOR_KEYS) {
    sum += colors[key].oklch.c;
  }
  return sum / COLOR_KEYS.length;
}

/** WCAG 2.x relative luminance, then contrast ratio. Exported for tests. */
export function wcagContrast(aHex: string, bHex: string): number {
  const lum = (hex: string): number => {
    const h = hex.slice(1);
    const part = (i: number): number => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const r = part(0);
    const g = part(2);
    const b = part(4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(aHex);
  const l2 = lum(bHex);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Worst-case contrast of any ANSI slot against the background, excluding the
 * slot(s) that conventionally blend with the background (see DARK_BG_BLENDS /
 * LIGHT_BG_BLENDS). Returns the ratio AND the slot that hit the minimum, so
 * tests can pin exact values.
 */
function minAnsiContrast(colors: Colors, isDark: boolean): { ratio: number; slot: ColorKey } {
  const blends = isDark ? DARK_BG_BLENDS : LIGHT_BG_BLENDS;
  const bgHex = colors.background.hex;
  let min = Infinity;
  let minSlot: ColorKey = 'foreground';
  for (const k of ANSI_KEYS) {
    if (blends.has(k)) continue;
    const ratio = wcagContrast(bgHex, colors[k].hex);
    if (ratio < min) {
      min = ratio;
      minSlot = k;
    }
  }
  return { ratio: min, slot: minSlot };
}

/**
 * Brightness-monotonicity check (issue #145): for each normal/bright ANSI
 * pair, the bright slot's OKLCH lightness must exceed the normal slot's.
 * Returns whether ALL 8 pairs hold, plus the BRIGHT slot names that violate
 * it (empty when fully ordered) so a report can point at the exact pair(s)
 * that are wrong.
 */
function brightnessMonotonicity(colors: Colors): { ordered: boolean; violations: ColorKey[] } {
  const violations: ColorKey[] = [];
  for (const [normal, bright] of BRIGHTNESS_PAIRS) {
    if (colors[bright].oklch.l <= colors[normal].oklch.l) {
      violations.push(bright);
    }
  }
  return { ordered: violations.length === 0, violations };
}

function contrastTags(
  fgOnBg: number,
  minAnsi: number,
  cursorOnBg: number,
  selectionContrast: number,
  brightnessOrdered: boolean,
): string[] {
  const tags: string[] = [];
  // Existing coarse tags — kept for backwards compat with downstream
  // consumers that already filter on them.
  //
  // Both numbers predate the WCAG tags below and were picked by eye, with no
  // standard behind them. They have aged badly and are documented here rather
  // than changed, because changing them would silently reclassify themes for
  // consumers already filtering on the tag:
  //
  //  - `high-contrast` (> 10) matches 422 of 633 themes (66.7%). A tag two
  //    thirds of the corpus carries is close to useless as a filter; > 12
  //    would select 285 (45.0%).
  //  - `low-contrast` (< 5) matches 31 (4.9%) and **overlaps `wcag-aa`**,
  //    which starts at 4.5. Six themes are tagged both at once
  //    (`tokyonight-day` 4.52:1, `everforest-light-med` 4.66:1,
  //    `iterm2-solarized-dark` 4.75:1, `everforest-light-hard` 4.84:1,
  //    `grass` 4.89:1, `ollie` 4.95:1) — "low contrast" and "meets AA" is a
  //    contradiction a consumer has to know to ignore.
  //
  // Prefer the `wcag-*` tags, which are anchored to the specification.
  if (fgOnBg > 10) tags.push('high-contrast');
  else if (fgOnBg < 5) tags.push('low-contrast');
  // WCAG 2.x body-text tiers (foreground vs background only — does NOT
  // certify ANSI-slot legibility; use `ansi-legible` for that).
  if (fgOnBg >= 7) tags.push('wcag-aaa');
  if (fgOnBg >= 4.5) tags.push('wcag-aa');
  else if (fgOnBg >= 3) tags.push('wcag-aa-large');
  else tags.push('wcag-fail');
  // Separate signal: every non-blending ANSI slot clears AA-large (3:1) — a
  // floor for colored terminal output readability.
  if (minAnsi >= 3) tags.push('ansi-legible');
  // Cursor vs background is a non-text UI element — WCAG 1.4.11 Non-text
  // Contrast's 3:1 floor applies, not the 4.5:1 body-text threshold.
  if (cursorOnBg >= 3.0) tags.push('cursor-visible');
  // Selected-text legibility: the schema has no dedicated selected-text-color
  // slot, so foreground-vs-selection-background is the meaningful pair —
  // "can you still read the text once it's selected?" Held to the WCAG 1.4.3
  // AA body-text bar (4.5:1) since selected text is still text.
  if (selectionContrast >= 4.5) tags.push('selection-legible');
  if (brightnessOrdered) tags.push('brightness-ordered');
  return tags;
}

/**
 * `vibrant` / `muted` from the mean OKLCH chroma of all 20 slots.
 *
 * **Both cuts were chosen by inspection, not derived** — and unlike the
 * `isDark` cut below, the corpus offers no natural boundary to snap to. Mean
 * chroma runs 0.0000 to 0.1931 with a median of 0.0915 and no gap anywhere
 * near either threshold, so these are conventions for "unusually saturated"
 * and "unusually flat", not measurements of a real discontinuity.
 *
 * Measured over the 633-theme corpus (2026-08):
 *
 * | cut | `muted` | | cut | `vibrant` |
 * |---|---|---|---|---|
 * | < 0.07 | 129 (20.4%) | | > 0.14 | 32 (5.1%) |
 * | **< 0.08** | **197 (31.1%)** | | **> 0.15** | **18 (2.8%)** |
 * | < 0.09 | 293 (46.3%) | | > 0.16 | 10 (1.6%) |
 *
 * 418 themes (66.0%) get neither tag. The density means the exact value
 * matters: shifting `muted` by 0.01 moves ~15% of the corpus, and themes
 * 0.0014 apart land on opposite sides of `vibrant` (`jackie-brown` 0.1494 vs
 * `grey-green` 0.1508). Treat these tags as a rough browse filter, not a
 * property of a theme.
 */
function chromaTag(colors: Colors): string | null {
  const avgC = averageChroma(colors);
  if (avgC > 0.15) return 'vibrant';
  if (avgC < 0.08) return 'muted';
  return null;
}

export function classifyTheme(theme: TerminalColorTheme): void {
  // Midpoint of the OKLCH lightness range. Nominally arbitrary, but the
  // corpus is sharply bimodal here, so it is the one threshold in this file
  // that is effectively free of judgement: only 5 of 633 themes (0.8%) have a
  // background lightness anywhere in [0.40, 0.60), and only 2 in [0.48,
  // 0.52). The nearest theme below the cut sits at L=0.4836 (`blue-dolphin`)
  // and the nearest above at L=0.5013 (`grass`).
  //
  // Any cut in [0.49, 0.50] classifies the identical 492 themes as dark — the
  // inert range is exactly (0.4836, 0.5013], bounded by those two themes — and
  // even moving it to 0.40 or 0.60 reclassifies at most 5. Terminal themes
  // commit to a polarity, and the data says so.
  theme.isDark = theme.colors.background.oklch.l < 0.5;

  const fgOnBg = wcagContrast(theme.colors.background.hex, theme.colors.foreground.hex);
  const { ratio: minAnsi, slot: minAnsiSlot } = minAnsiContrast(theme.colors, theme.isDark);
  const cursorOnBg = wcagContrast(theme.colors.background.hex, theme.colors.cursor.hex);
  const selectionContrast = wcagContrast(theme.colors.foreground.hex, theme.colors.selection.hex);
  const { ordered: brightnessOrdered, violations: brightnessViolations } = brightnessMonotonicity(
    theme.colors,
  );
  theme.contrast = {
    fgOnBg,
    minAnsi,
    minAnsiSlot,
    cursorOnBg,
    selectionContrast,
    brightnessOrdered,
    brightnessViolations,
  };

  // APCA Lc scores (issue #151): additive, data-only — see src/apca.ts.
  // Computed alongside `contrast` since both are per-theme metrics with no
  // cross-theme dependency (unlike accent/dataviz/counterpart, which need
  // the full theme list and run later in scripts/build.ts).
  theme.apca = computeApca(theme.colors, theme.isDark);

  // Colorblind-safety scores + tags (issue #149): see src/cvd.ts.
  const cvd = computeCvd(theme.colors);
  theme.cvd = cvd;

  const tags: string[] = [theme.isDark ? 'dark' : 'light'];
  const chroma = chromaTag(theme.colors);
  if (chroma !== null) tags.push(chroma);
  tags.push(...contrastTags(fgOnBg, minAnsi, cursorOnBg, selectionContrast, brightnessOrdered));
  tags.push(...cvdTags(cvd));
  if (POPULAR_KEYWORDS.some((p) => theme.slug.includes(p))) tags.push('popular');

  theme.tags = tags;
}
