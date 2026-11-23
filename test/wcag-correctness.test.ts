import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { classifyTheme, contrastTags, wcagContrast } from '../src/classify.js';
import { convertHexToColor } from '../src/convert.js';
import { computeApca } from '../src/apca.js';
import { serializeWcagRatio } from '../src/wcag-precision.js';
import type { TerminalColorTheme } from '../src/types.js';

function fixture(): TerminalColorTheme {
  return JSON.parse(
    readFileSync(new URL('../data/by-name/dracula.json', import.meta.url), 'utf8'),
  ) as TerminalColorTheme;
}
function below(value: number): number {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value);
  bytes.setBigUint64(0, bytes.getBigUint64(0) - 1n);
  return bytes.getFloat64(0);
}

describe('unrounded WCAG decisions and conservative serialization', () => {
  it('does not promote #008580 on white to AA', () => {
    const theme = fixture();
    theme.colors.background = convertHexToColor('#ffffff');
    theme.colors.foreground = convertHexToColor('#008580');
    classifyTheme(theme);
    expect(wcagContrast('#008580', '#ffffff')).toBeCloseTo(4.49995427140476, 12);
    expect(theme.tags).not.toContain('wcag-aa');
    expect(theme.tags).toContain('wcag-aa-large');
    expect(theme.contrast.fgOnBg).toBe(4.4999);
  });
  it('does not grant selection legibility by rounding', () => {
    const theme = fixture();
    theme.colors.foreground = convertHexToColor('#008580');
    theme.colors.selection = convertHexToColor('#ffffff');
    classifyTheme(theme);
    expect(theme.tags).not.toContain('selection-legible');
    expect(theme.contrast.selectionContrast).toBeLessThan(4.5);
  });
  it.each([3, 4.5, 7])('keeps below/at/above %s on their actual side', (threshold) => {
    const low = below(threshold);
    expect(serializeWcagRatio(low)).toBeLessThan(threshold);
    expect(serializeWcagRatio(threshold)).toBe(threshold);
    expect(serializeWcagRatio(threshold + 0.0001)).toBeGreaterThanOrEqual(threshold);
  });
  it.each([1.0001, 3.0041, 4.4999, 7.1234, 14.4252, 20.9999])(
    'does not round multiplication-edge value below %s upward',
    (value) => {
      const raw = below(value);
      expect(serializeWcagRatio(raw)).toBeLessThanOrEqual(raw);
    },
  );
  it('never overstates arbitrary finite valid contrast ratios and retains four decimals', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 21, noNaN: true }), (raw) => {
        const serialized = serializeWcagRatio(raw);
        expect(serialized).toBeLessThanOrEqual(raw);
        expect(raw - serialized).toBeLessThan(0.000100000001);
        expect(Math.round(serialized * 10000) / 10000).toBe(serialized);
      }),
    );
  });
  it.each([3, 4.5, 7])('derives actual tier decisions from raw ratios around %s', (threshold) => {
    for (const value of [below(threshold), threshold, threshold + 0.0001]) {
      const tags = contrastTags(value, value, value, value, false);
      expect(tags.includes('wcag-aa')).toBe(value >= 4.5);
      expect(tags.includes('wcag-aaa')).toBe(value >= 7);
      expect(tags.includes('wcag-aa-large')).toBe(value >= 3 && value < 4.5);
      expect(tags.includes('ansi-legible')).toBe(value >= 3);
      expect(tags.includes('cursor-visible')).toBe(value >= 3);
      expect(tags.includes('selection-legible')).toBe(value >= 4.5);
    }
  });
  it('preserves the pre-existing rounded legacy high/low contrast policy', () => {
    expect(contrastTags(10.00004, 21, 21, 21, false)).not.toContain('high-contrast');
    expect(contrastTags(4.99996, 21, 21, 21, false)).not.toContain('low-contrast');
  });
  it('retains exact 21:1, symmetry, and supplemental APCA polarity', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBe(21);
    expect(wcagContrast('#ffffff', '#000000')).toBe(21);
    const dark = fixture(),
      light = fixture();
    dark.colors.background = convertHexToColor('#000000');
    dark.colors.foreground = convertHexToColor('#ffffff');
    light.colors.background = dark.colors.foreground;
    light.colors.foreground = dark.colors.background;
    expect(computeApca(dark.colors, true).fgOnBg).toBeLessThan(0);
    expect(computeApca(light.colors, false).fgOnBg).toBeGreaterThan(0);
  });
});
