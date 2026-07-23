import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { calcAPCA } from 'apca-w3';
import { describe, expect, it } from 'vitest';
import { computeApca } from '../src/apca.js';
import { ApcaSchema } from '../src/schema.js';
import { COLOR_KEYS } from '../src/types.js';
import type { Apca, ColorKey, ColorValue, Colors } from '../src/types.js';

// computeApca reads only `colors[key].hex` (apca-w3 parses it directly) — the
// `oklch`/`oklchCss` fields are irrelevant to this module. Fixtures just need
// real, parseable 6-digit hex strings, same convention as test/cvd.test.ts.
function hexColor(hex: string): ColorValue {
  return { hex, oklch: { l: 0, c: 0, h: 0 }, oklchCss: 'oklch(0 0 0)' };
}

function makeColors(overrides: Partial<Record<ColorKey, string>> = {}): Colors {
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    colors[key] = hexColor(overrides[key] ?? '#808080');
  }
  return colors;
}

describe("computeApca — fgOnBg matches apca-w3's own published test vectors exactly", () => {
  // Hand-verified vectors from apca-w3's packaged test suite
  // (node_modules/apca-w3/test/index.js) — confirms this module is a thin,
  // correct pass-through to the reference implementation, never a
  // hand-rolled reimplementation. 3-digit shorthand in the original vectors
  // (#888/#fff) expands to the 6-digit form our schema requires; verified
  // identical via `calcAPCA('#888888','#ffffff')` === the 3-digit result.
  it('dark text (#888888) on a light background (#ffffff): positive Lc (BoW polarity)', () => {
    const colors = makeColors({ foreground: '#888888', background: '#ffffff' });
    const { fgOnBg } = computeApca(colors, false);
    expect(fgOnBg).toBe(63.056469930209424);
  });

  it('light text (#ffffff) on a dark background (#888888): negative Lc (WoB polarity)', () => {
    const colors = makeColors({ foreground: '#ffffff', background: '#888888' });
    const { fgOnBg } = computeApca(colors, true);
    expect(fgOnBg).toBe(-68.54146436644962);
  });

  it('#000000 text on #aaaaaa background', () => {
    const colors = makeColors({ foreground: '#000000', background: '#aaaaaa' });
    const { fgOnBg } = computeApca(colors, false);
    expect(fgOnBg).toBe(58.146262578561334);
  });

  it('#112233 text on #ddeeff background', () => {
    const colors = makeColors({ foreground: '#112233', background: '#ddeeff' });
    const { fgOnBg } = computeApca(colors, false);
    expect(fgOnBg).toBe(91.66830811481631);
  });
});

describe('computeApca — minAnsi / minAnsiSlot', () => {
  it('picks the ANSI slot with the smallest absolute Lc against the background', () => {
    // background is near-black; every default-filled ('#808080', mid-gray)
    // ANSI slot has a large |Lc|, except `blue`, deliberately set close to
    // the background so it alone has a tiny |Lc|.
    const colors = makeColors({
      background: '#101010',
      foreground: '#ffffff',
      blue: '#141414', // near-identical to background
    });
    const { minAnsi, minAnsiSlot } = computeApca(colors, true);
    expect(minAnsiSlot).toBe('blue');
    expect(Math.abs(minAnsi)).toBeLessThan(2);
    // Sanity: matches a direct calcAPCA call on the same pair.
    expect(minAnsi).toBe(calcAPCA('#141414', '#101010'));
  });

  it('excludes black/brightBlack on a dark theme even if they are the closest slot to bg', () => {
    const colors = makeColors({
      background: '#000000',
      foreground: '#ffffff',
      black: '#010101', // near-identical to bg — must be excluded (isDark)
      brightBlack: '#020202', // also near-identical — also excluded
      red: '#330000', // the "real" worst non-excluded slot
    });
    const { minAnsiSlot } = computeApca(colors, true);
    expect(minAnsiSlot).not.toBe('black');
    expect(minAnsiSlot).not.toBe('brightBlack');
  });

  it('excludes white/brightWhite on a light theme even if they are the closest slot to bg', () => {
    const colors = makeColors({
      background: '#ffffff',
      foreground: '#000000',
      white: '#fefefe', // near-identical to bg — must be excluded (light theme)
      brightWhite: '#fdfdfd',
      red: '#ffcccc', // the "real" worst non-excluded slot
    });
    const { minAnsiSlot } = computeApca(colors, false);
    expect(minAnsiSlot).not.toBe('white');
    expect(minAnsiSlot).not.toBe('brightWhite');
  });
});

describe('ApcaSchema', () => {
  it('accepts a well-formed apca block, including a negative Lc', () => {
    expect(
      ApcaSchema.safeParse({ fgOnBg: -99.5, minAnsi: -12.3, minAnsiSlot: 'blue' }).success,
    ).toBe(true);
  });

  it('rejects a non-finite Lc', () => {
    expect(
      ApcaSchema.safeParse({ fgOnBg: Infinity, minAnsi: -12.3, minAnsiSlot: 'blue' }).success,
    ).toBe(false);
  });

  it('rejects an invalid minAnsiSlot', () => {
    expect(
      ApcaSchema.safeParse({ fgOnBg: 50, minAnsi: 12, minAnsiSlot: 'notAColorKey' }).success,
    ).toBe(false);
  });
});

describe('real-data sanity: apca.fgOnBg polarity matches isDark', () => {
  const ROOT = resolve(new URL('../', import.meta.url).pathname);

  function loadTheme(slug: string): { apca: Apca; isDark: boolean } {
    return JSON.parse(readFileSync(join(ROOT, 'data', 'by-name', `${slug}.json`), 'utf8')) as {
      apca: Apca;
      isDark: boolean;
    };
  }

  it('dracula (dark) has a negative fgOnBg (light text on dark background)', () => {
    const { apca, isDark } = loadTheme('dracula');
    expect(isDark).toBe(true);
    expect(apca.fgOnBg).toBeLessThan(0);
  });

  it('wong-colorblind-safe-light (light) has a positive fgOnBg (dark text on light background)', () => {
    const { apca, isDark } = loadTheme('wong-colorblind-safe-light');
    expect(isDark).toBe(false);
    expect(apca.fgOnBg).toBeGreaterThan(0);
  });
});
