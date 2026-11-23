import { sampledContrast, type SrgbSample } from './contrast-sample';
import { ANSI_PAIRS } from './specimen-roles';
import { formatRatio } from './formatters';
import type { ThemeDetailsRecord } from './theme-details';

export type SummaryTheme = Pick<ThemeDetailsRecord, 'name' | 'slug' | 'colors'> & {
  apca?: ThemeDetailsRecord['apca'];
  cvd?: ThemeDetailsRecord['cvd'];
};

export const CHROMATIC_NORMAL = ['red', 'green', 'yellow', 'blue', 'purple', 'cyan'] as const;

export function hexSample(hex: string): SrgbSample {
  if (!/^#[a-f0-9]{6}$/i.test(hex)) throw new RangeError('Expected a canonical six-digit sRGB hex');
  const channel = (start: number): number => Number.parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

/** Exact declared 8-bit source channels, not a sampled rendered-CSS measurement. */
export function canonicalContrast(foreground: string, background: string): number {
  return sampledContrast(hexSample(foreground), hexSample(background), 4.5, 0).ratio;
}

export function summarizeTheme(theme: SummaryTheme) {
  const colors = theme.colors;
  return {
    backgroundLightness: colors.background.oklch.l,
    backgroundHue: colors.background.oklch.c === 0 ? null : colors.background.oklch.h,
    meanAnsiChroma: CHROMATIC_NORMAL.reduce((sum, key) => sum + colors[key].oklch.c, 0) / 6,
    meanAllChroma: Object.values(colors).reduce((sum, color) => sum + color.oklch.c, 0) / 20,
    foregroundContrast: canonicalContrast(colors.foreground.hex, colors.background.hex),
    commentContrast: canonicalContrast(colors.brightBlack.hex, colors.background.hex),
    apca: theme.apca ?? null,
    cvd: theme.cvd ?? null,
  };
}

export function normalBrightPairs(theme: SummaryTheme) {
  return ANSI_PAIRS.map(([normal, bright]) => ({
    normal,
    bright,
    deltaL: theme.colors[bright].oklch.l - theme.colors[normal].oklch.l,
    deltaC: theme.colors[bright].oklch.c - theme.colors[normal].oklch.c,
    normalContrast: canonicalContrast(theme.colors[normal].hex, theme.colors.background.hex),
    brightContrast: canonicalContrast(theme.colors[bright].hex, theme.colors.background.hex),
  }));
}

/** Optional hooks let the shell SSR the same values without coupling its markup here. */
export function paintThemeSummary(root: HTMLElement, theme: SummaryTheme): void {
  const summary = summarizeTheme(theme);
  const values: Record<string, string> = {
    l: `${(summary.backgroundLightness * 100).toFixed(2)}%`,
    c: summary.meanAnsiChroma.toFixed(4),
    fg: formatRatio(summary.foregroundContrast),
    comment: formatRatio(summary.commentContrast),
    'all-c': summary.meanAllChroma.toFixed(4),
    hue: summary.backgroundHue === null ? 'Neutral / unavailable' : `${summary.backgroundHue}°`,
    apca:
      summary.apca === null
        ? 'Unavailable'
        : `${summary.apca.fgOnBg >= 0 ? '+' : ''}${summary.apca.fgOnBg} Lc`,
    cvd:
      summary.cvd === null
        ? 'Unavailable'
        : `d ${summary.cvd.deuteranopia} · p ${summary.cvd.protanopia} · t ${summary.cvd.tritanopia}`,
    scope: 'Canonical palette · sRGB',
  };
  for (const [key, value] of Object.entries(values)) {
    for (const element of root.querySelectorAll<HTMLElement>(`[data-summary-${key}]`)) {
      element.textContent = value;
    }
  }
}
