import type { ColorKey, Colors, TerminalColorTheme } from './types.js';
import { COLOR_KEYS } from './types.js';

// 16 ANSI slots (no bg/fg/cursor/selection). minAnsi contrast runs over a
// subset of these depending on isDark — see DARK_BG_BLENDS / LIGHT_BG_BLENDS.
const ANSI_KEYS: readonly ColorKey[] = [
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

// ANSI slots that are expected to be near-bg by convention — excluded from the
// "worst ANSI slot vs bg" calculation so we don't false-flag well-formed themes.
const DARK_BG_BLENDS: ReadonlySet<ColorKey> = new Set(['black', 'brightBlack']);
const LIGHT_BG_BLENDS: ReadonlySet<ColorKey> = new Set(['white', 'brightWhite']);

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

function chromaTag(colors: Colors): string | null {
  const avgC = averageChroma(colors);
  if (avgC > 0.15) return 'vibrant';
  if (avgC < 0.08) return 'muted';
  return null;
}

export function classifyTheme(theme: TerminalColorTheme): void {
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

  const tags: string[] = [theme.isDark ? 'dark' : 'light'];
  const chroma = chromaTag(theme.colors);
  if (chroma !== null) tags.push(chroma);
  tags.push(...contrastTags(fgOnBg, minAnsi, cursorOnBg, selectionContrast, brightnessOrdered));
  if (POPULAR_KEYWORDS.some((p) => theme.slug.includes(p))) tags.push('popular');

  theme.tags = tags;
}
