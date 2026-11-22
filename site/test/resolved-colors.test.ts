import { describe, expect, it } from 'vitest';
import { sampledContrast } from '../src/lib/contrast-sample';
import { wcagContrast } from '../../src/classify';

describe('sampled CSS contrast bounds', () => {
  it('retains the independent black/white ratio and bounds its sample error', () => {
    const result = sampledContrast([0, 0, 0], [255, 255, 255]);
    expect(result.ratio).toBe(21);
    expect(result.minimum).toBeGreaterThan(20);
    expect(result.maximum).toBe(21);
    expect(result.assessment).toBe('pass');
  });

  it('matches the package WCAG function for all 8-bit gray channels', () => {
    for (let channel = 0; channel <= 255; channel++) {
      const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
      expect(sampledContrast([channel, channel, channel], [255, 255, 255]).ratio).toBeCloseTo(
        wcagContrast(hex, '#ffffff'),
        12,
      );
    }
  });

  it('does not promote a just-failing teal pair across ordinary-text AA', () => {
    const result = sampledContrast([0, 133, 128], [255, 255, 255]);
    expect(result.ratio).toBeCloseTo(4.49995427140476, 10);
    expect(result.minimum).toBeLessThan(4.5);
    expect(result.maximum).toBeGreaterThan(4.5);
    expect(result.assessment).toBe('indeterminate');
  });

  it('fails a clearly weak pair and is symmetric when foreground swaps', () => {
    const result = sampledContrast([160, 160, 160], [255, 255, 255]);
    expect(result.assessment).toBe('fail');
    expect(result.maximum).toBeLessThan(3);
    const reversed = sampledContrast([255, 255, 255], [160, 160, 160]);
    expect(reversed).toMatchObject({
      ratio: result.ratio,
      minimum: result.minimum,
      maximum: result.maximum,
    });
  });

  it('covers overlapping luminance intervals conservatively', () => {
    const result = sampledContrast([127, 127, 127], [128, 128, 128]);
    expect(result.minimum).toBe(1);
    expect(result.maximum).toBeGreaterThan(result.ratio);
  });

  it('does not invent contrast for invalid channels or thresholds', () => {
    expect(() => sampledContrast([NaN, 0, 0], [0, 0, 0])).toThrow(RangeError);
    expect(() => sampledContrast([0, 0, 0], [256, 0, 0])).toThrow(RangeError);
    expect(() => sampledContrast([0, 0, 0], [0, 0, 0], 0)).toThrow(RangeError);
    expect(() => sampledContrast([0, 0, 0], [0, 0, 0], 4.5, -1)).toThrow(RangeError);
  });
});
