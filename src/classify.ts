import type { Colors, TerminalColorTheme } from './types.js';
import { COLOR_KEYS } from './types.js';

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

function wcagContrast(bgHex: string, fgHex: string): number {
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
  const l1 = lum(bgHex);
  const l2 = lum(fgHex);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function classifyTheme(theme: TerminalColorTheme): void {
  theme.isDark = theme.colors.background.oklch.l < 0.5;

  const tags: string[] = [];
  tags.push(theme.isDark ? 'dark' : 'light');

  const avgC = averageChroma(theme.colors);
  if (avgC > 0.15) tags.push('vibrant');
  else if (avgC < 0.08) tags.push('muted');

  const contrast = wcagContrast(theme.colors.background.hex, theme.colors.foreground.hex);
  if (contrast > 10) tags.push('high-contrast');
  else if (contrast < 5) tags.push('low-contrast');

  if (POPULAR_KEYWORDS.some((p) => theme.slug.includes(p))) tags.push('popular');

  theme.tags = tags;
}
