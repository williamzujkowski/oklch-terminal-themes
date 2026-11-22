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

describe('ramp progression and explicit recorded origins', () => {
  it('reports non-monotonic L and duplicate canonical steps without inventing neutral hues', () => {
    const theme = fixture('dracula');
    const black = convertHexToColor('#000000'),
      white = convertHexToColor('#ffffff');
    theme.dataviz!.sequential = [black, white, black];
    const result = report(theme);
    expect(result.sequential.progression.lightness).toEqual([0, 1, 0]);
    expect(result.sequential.progression.chroma).toEqual([0, 0, 0]);
    expect(result.sequential.progression.hue).toEqual([null, null, null]);
    expect(result.sequential.progression.direction).toBe('not-monotonic');
    expect(result.sequential.progression.duplicateHexPairs).toEqual([[0, 2]]);
    expect(result.sequential.entries.every((entry) => entry.origin.kind === 'derived-ramp')).toBe(
      true,
    );
  });
  it('names the actual midpoint and audits both diverging arms separately', () => {
    const theme = fixture('dracula');
    theme.dataviz!.diverging = ['#ff0000', '#ffffff', '#0000ff'].map(convertHexToColor);
    const result = report(theme).diverging;
    expect(result.midpoint).toMatchObject({
      status: 'available',
      index: 1,
      hex: '#ffffff',
      label: 'Center step',
    });
    expect(result.leftArm.direction).toBe('increasing');
    expect(result.rightArm.direction).toBe('decreasing');
    expect(result.leftArm.indices).toEqual([0, 1]);
    expect(result.rightArm.indices).toEqual([1, 2]);
  });
  it('reports a constant ramp and refuses to fabricate a midpoint for an even ramp', () => {
    const theme = fixture('dracula'),
      white = convertHexToColor('#ffffff');
    theme.dataviz!.sequential = [white, white, white];
    theme.dataviz!.diverging = [white, white];
    const result = report(theme);
    expect(result.sequential.progression.direction).toBe('constant');
    expect(result.sequential.progression.duplicateHexPairs).toHaveLength(3);
    expect(result.diverging.midpoint.status).toBe('unavailable');
    expect(result.diverging.leftArm).toBeNull();
    expect(result.diverging.rightArm).toBeNull();
  });
  it('keeps synthesized entries derived even when their values equal a source slot', () => {
    const theme = fixture('dracula');
    theme.dataviz!.categorical = [theme.colors.red];
    theme.dataviz!.categoricalSynthesized = 1;
    expect(report(theme).categorical.entries[0]!.origin.kind).toBe('synthesized');
  });
  it('reports ambiguous complete source matches without claiming unique authorship', () => {
    const theme = fixture('dracula'),
      value = theme.colors.red;
    for (const key of Object.keys(theme.colors) as (keyof typeof theme.colors)[])
      theme.colors[key] = value;
    theme.dataviz!.categorical = [value];
    delete theme.dataviz!.categoricalSynthesized;
    const origin = report(theme).categorical.entries[0]!.origin;
    expect(origin.kind).toBe('copied');
    expect(origin.matchingSlots).toHaveLength(20);
    expect(origin.ambiguous).toBe(true);
    expect(origin.chosenMatch).toBe('background');
    expect(origin.reason).toContain('not unique authorship');
  });
  it('reports missing source-copy identity instead of inventing it from matching hex alone', () => {
    const theme = fixture('dracula'),
      source = theme.dataviz!.categorical[0]!;
    source.oklchCss = 'oklch(0.5 0.1 20)';
    expect(report(theme).categorical.entries[0]!.origin.kind).toBe('unavailable');
  });
  it('uses the actual synthesized suffix recorded for Hercules Graphics', () => {
    const theme = fixture('hercules-graphics'),
      result = report(theme);
    const copied = theme.dataviz!.categorical.length - theme.dataviz!.categoricalSynthesized!;
    expect(theme.dataviz!.categoricalSynthesized).toBeGreaterThan(0);
    result.categorical.entries.forEach((entry, index) => {
      expect(entry.origin.kind).toBe(index < copied ? 'copied' : 'synthesized');
    });
  });
  it.each([-1, 0.5, 99])('rejects invalid recorded synthesized count %s explicitly', (count) => {
    const theme = fixture('dracula');
    theme.dataviz!.categoricalSynthesized = count;
    const result = computeChartDiagnostics(theme);
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toContain('synthesized');
  });
  it('keeps a two-color fixture independently identifiable on all three axes', () => {
    const theme = fixture('dracula');
    theme.dataviz!.categorical = ['#000000', '#ffffff'].map(convertHexToColor);
    theme.dataviz!.categoricalSynthesized = 2;
    const result = report(theme).categorical;
    for (const axis of [result.ordinary, ...Object.values(result.deficiencies)]) {
      expect(axis.minimum!.indices).toEqual([0, 1]);
      expect(axis.minimum!.hexes).toEqual(['#000000', '#ffffff']);
      expect(axis.minimum!.deltaE).toBeCloseTo(100, 3);
    }
  });
});
