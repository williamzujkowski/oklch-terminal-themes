import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeChartDiagnostics } from '../src/lib/chart-diagnostics';
import { convertHexToColor } from '../../src/convert.js';
import type { TerminalColorTheme } from '../../src/types.js';

function fixture(slug: string): TerminalColorTheme {
  return JSON.parse(
    readFileSync(new URL(`../../data/by-name/${slug}.json`, import.meta.url), 'utf8'),
  ) as TerminalColorTheme;
}
function report(theme: TerminalColorTheme) {
  const result = computeChartDiagnostics(theme);
  expect(result.status).toBe('available');
  if (result.status !== 'available') throw new Error(result.reason);
  return result;
}

describe('canonical chart-specific separation', () => {
  it('measures GitHub chart colors instead of borrowing its cvd-safe ANSI tag', () => {
    const theme = fixture('github'),
      result = report(theme);
    expect(theme.tags).toContain('cvd-safe');
    expect(theme.cvd!.deuteranopia).toBeCloseTo(15.6256, 3);
    expect(result.categorical.deficiencies.deuteranopia.minimum!.deltaE).toBeCloseTo(3.7279, 3);
    expect(result.categorical.deficiencies.protanopia.minimum!.deltaE).toBeCloseTo(6.1171, 3);
    expect(result.categorical.ordinary.pairs).toHaveLength(21);
    for (const axis of Object.values(result.categorical.deficiencies))
      expect(axis.pairs).toHaveLength(21);
    expect(result.scope).toBe('Canonical chart palette · sRGB');
    expect(result.rendered.status).toBe('not-measured');
  });
  it('reveals Wong Light chart confusion independently of six normal ANSI scores', () => {
    const theme = fixture('wong-colorblind-safe-light'),
      result = report(theme);
    expect(theme.cvd!.protanopia).toBeGreaterThan(10);
    expect(result.categorical.deficiencies.deuteranopia.minimum!.deltaE).toBeCloseTo(8.5901, 3);
    expect(result.categorical.deficiencies.protanopia.minimum!.deltaE).toBeCloseTo(1.3302, 3);
    expect(result.severity).toBe(1);
    expect(result.projectHeuristicDeltaE).toBe(10);
  });
  it('measures every pair and tracks limiting identities after reorder', () => {
    const theme = fixture('dracula');
    const black = convertHexToColor('#000000'),
      white = convertHexToColor('#ffffff');
    theme.dataviz!.categorical = [black, white, black];
    theme.dataviz!.categoricalSynthesized = 3;
    let result = report(theme);
    expect(result.categorical.ordinary.minimum!.indices).toEqual([0, 2]);
    expect(result.categorical.ordinary.minimum!.deltaE).toBe(0);
    expect(result.categorical.ordinary.pairs).toHaveLength(3);
    theme.dataviz!.categorical = [white, black, black];
    result = report(theme);
    expect(result.categorical.ordinary.minimum!.indices).toEqual([1, 2]);
    expect(result.categorical.ordinary.minimum!.sources.map((s) => s.kind)).toEqual([
      'synthesized',
      'synthesized',
    ]);
  });
  it('checks canonical background contrast separately from pair separation', () => {
    const theme = fixture('dracula');
    theme.colors.background = convertHexToColor('#ffffff');
    theme.dataviz!.categorical = [convertHexToColor('#000000'), convertHexToColor('#ffffff')];
    theme.dataviz!.categoricalSynthesized = 2;
    const result = report(theme);
    expect(result.categorical.background.pairs.map((p) => p.ratio)).toEqual([21, 1]);
    expect(result.categorical.background.minimum).toMatchObject({ index: 1, ratio: 1 });
    expect(result.categorical.ordinary.minimum!.deltaE).toBeGreaterThan(90);
  });
  it('keeps absent, malformed, and undersized palette metrics explicit', () => {
    const absent = fixture('dracula');
    delete absent.dataviz;
    expect(computeChartDiagnostics(absent).status).toBe('unavailable');
    const malformed = fixture('dracula');
    malformed.dataviz!.categorical[0]!.hex = 'var(--red)';
    expect(computeChartDiagnostics(malformed).status).toBe('unavailable');
    const single = fixture('dracula');
    single.dataviz!.categorical = [single.colors.red];
    const result = report(single);
    expect(result.categorical.ordinary.status).toBe('unavailable');
    expect(result.categorical.ordinary.minimum).toBeNull();
    expect(result.categorical.ordinary.reason).toContain('two');
  });
  it('does not mutate source colors, chart colors, or origin metadata', () => {
    const theme = fixture('hercules-graphics'),
      before = structuredClone(theme);
    report(theme);
    expect(theme).toEqual(before);
  });
});
