import { readFileSync } from 'node:fs';
import { converter, differenceCiede2000, filterDeficiencyDeuter, parse } from 'culori';
import { describe, expect, it } from 'vitest';
import { computeCvd, CVD_ANSI_KEYS, minPairwiseDeltaE } from '../src/cvd.js';
import { simulateCvd } from '../src/cvd-palette.js';
import type { Color } from 'culori';
import type { TerminalColorTheme } from '../src/types.js';

const toRgb = converter('rgb');
function color(hex: string): Color {
  const value = parse(hex);
  if (value === undefined) throw new Error(hex);
  return value;
}

describe('shared existing CVD simulation', () => {
  it('preserves existing public CVD outputs over the entire committed corpus', () => {
    const themes = JSON.parse(
      readFileSync(new URL('../data/themes.json', import.meta.url), 'utf8'),
    ) as TerminalColorTheme[];
    for (const theme of themes) {
      const scores = computeCvd(theme.colors);
      for (const deficiency of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
        const simulated = CVD_ANSI_KEYS.map((key) =>
          simulateCvd(color(theme.colors[key].hex), deficiency),
        );
        expect(scores[deficiency], `${theme.slug}.${deficiency}`).toBe(
          minPairwiseDeltaE(simulated),
        );
        expect(scores[deficiency]).toBeCloseTo(theme.cvd![deficiency], 4);
      }
    }
  });
  it.each(['deuteranopia', 'protanopia', 'tritanopia'] as const)(
    'keeps gray neutral under %s',
    (deficiency) => {
      const simulated = toRgb(simulateCvd(color('#808080'), deficiency));
      expect(simulated.r).toBeCloseTo(simulated.g, 6);
      expect(simulated.g).toBeCloseTo(simulated.b, 6);
    },
  );
  it('retains the independently pinned Mirage linear-light example, not gamma-space filtering', () => {
    const red = color('#ff9999'),
      green = color('#85cc95');
    const diff = differenceCiede2000();
    const linear = diff(simulateCvd(red, 'deuteranopia'), simulateCvd(green, 'deuteranopia'));
    const gammaFilter = filterDeficiencyDeuter(1);
    const gamma = diff(gammaFilter(red), gammaFilter(green));
    expect(linear).toBeCloseTo(1.7, 1);
    expect(Math.abs(linear - gamma)).toBeGreaterThan(1);
  });
});
