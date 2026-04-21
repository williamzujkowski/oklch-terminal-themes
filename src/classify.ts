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

function contrastTags(fgOnBg: number, minAnsi: number): string[] {
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
  theme.contrast = { fgOnBg, minAnsi, minAnsiSlot };

  const tags: string[] = [theme.isDark ? 'dark' : 'light'];
  const chroma = chromaTag(theme.colors);
  if (chroma !== null) tags.push(chroma);
  tags.push(...contrastTags(fgOnBg, minAnsi));
  if (POPULAR_KEYWORDS.some((p) => theme.slug.includes(p))) tags.push('popular');

  theme.tags = tags;
}
