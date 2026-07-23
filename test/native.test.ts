import { describe, expect, it } from 'vitest';
import { parseNativeJson } from '../src/parsers/native.js';
import { NativeColorInputSchema, NativeOklchCssSchema, NativeSchemeSchema } from '../src/schema.js';

// Issue #132: native theme sources (data-sources/native/*.json) may author
// each color slot as hex (unchanged today-format), an oklch() CSS string, or
// an {l, c, h} object.

function nativeFixture(background: unknown): Record<string, unknown> {
  return {
    name: 'Fixture',
    background,
    foreground: '#14110d',
    cursorColor: '#0465af',
    selectionBackground: '#d1e7ff',
    black: '#191610',
    red: '#a44a46',
    green: '#2f7434',
    yellow: '#826100',
    blue: '#2669a8',
    purple: '#7f549e',
    cyan: '#007273',
    white: '#cfcdca',
    brightBlack: '#716e68',
    brightRed: '#ad534e',
    brightGreen: '#377c3c',
    brightYellow: '#8c6900',
    brightBlue: '#2f71b1',
    brightPurple: '#885ca6',
    brightCyan: '#007b7c',
    brightWhite: '#ecebe8',
  };
}

describe('NativeColorInputSchema', () => {
  it('accepts a hex-form color, unchanged from today', () => {
    expect(NativeColorInputSchema.parse('#f8f6f3')).toBe('#f8f6f3');
  });

  it('accepts an oklch() CSS string', () => {
    expect(NativeColorInputSchema.parse('oklch(0.975 0.005 80)')).toBe('oklch(0.975 0.005 80)');
  });

  it('accepts an {l, c, h} object', () => {
    expect(NativeColorInputSchema.parse({ l: 0.975, c: 0.005, h: 80 })).toEqual({
      l: 0.975,
      c: 0.005,
      h: 80,
    });
  });

  it('rejects a malformed hex string', () => {
    expect(() => NativeColorInputSchema.parse('not-a-color')).toThrow();
  });

  it('rejects an {l, c, h} object with l > 1', () => {
    expect(() => NativeColorInputSchema.parse({ l: 1.5, c: 0.005, h: 80 })).toThrow();
  });

  it('rejects an {l, c, h} object with a non-numeric field', () => {
    expect(() => NativeColorInputSchema.parse({ l: 'not-a-number', c: 0.005, h: 80 })).toThrow();
  });
});

describe('NativeOklchCssSchema', () => {
  it('accepts a well-formed oklch() string', () => {
    expect(NativeOklchCssSchema.parse('oklch(0.975 0.005 80)')).toBe('oklch(0.975 0.005 80)');
  });

  it('rejects l > 1 even though the string is well-formed', () => {
    expect(() => NativeOklchCssSchema.parse('oklch(1.5 0.005 80)')).toThrow();
  });

  it('rejects c > 0.5', () => {
    expect(() => NativeOklchCssSchema.parse('oklch(0.5 0.9 80)')).toThrow();
  });

  it('rejects h > 360', () => {
    expect(() => NativeOklchCssSchema.parse('oklch(0.5 0.1 400)')).toThrow();
  });

  it('rejects a non-numeric component', () => {
    expect(() => NativeOklchCssSchema.parse('oklch(abc 0.005 80)')).toThrow();
  });

  it('rejects a plain hex string (wrong schema for this form)', () => {
    expect(() => NativeOklchCssSchema.parse('#f8f6f3')).toThrow();
  });
});

describe('parseNativeJson', () => {
  it('parses a hex-only file, unchanged from today', () => {
    const parsed = parseNativeJson(JSON.stringify(nativeFixture('#f8f6f3')));
    expect(parsed.background).toBe('#f8f6f3');
  });

  it('parses a file with an oklch() CSS string slot', () => {
    const parsed = parseNativeJson(JSON.stringify(nativeFixture('oklch(0.975 0.005 80)')));
    expect(parsed.background).toBe('oklch(0.975 0.005 80)');
  });

  it('parses a file with an {l, c, h} object slot', () => {
    const parsed = parseNativeJson(JSON.stringify(nativeFixture({ l: 0.975, c: 0.005, h: 80 })));
    expect(parsed.background).toEqual({ l: 0.975, c: 0.005, h: 80 });
  });

  it('throws on an invalid oklch object (l > 1)', () => {
    expect(() =>
      parseNativeJson(JSON.stringify(nativeFixture({ l: 1.5, c: 0.005, h: 80 }))),
    ).toThrow();
  });

  it('throws on a non-numeric oklch component', () => {
    expect(() => parseNativeJson(JSON.stringify(nativeFixture('oklch(x 0.005 80)')))).toThrow();
  });

  it('throws on malformed JSON', () => {
    expect(() => parseNativeJson('{not valid json')).toThrow();
  });
});

describe('NativeSchemeSchema', () => {
  it('is .loose() — tolerates unknown extra keys', () => {
    const fixture = { ...nativeFixture('#f8f6f3'), extraField: 'ignored' };
    expect(() => NativeSchemeSchema.parse(fixture)).not.toThrow();
  });
});
