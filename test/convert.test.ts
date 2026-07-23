import { describe, expect, it } from 'vitest';
import {
  convertHexToColor,
  convertOklchToColor,
  oklchRoundTripDeltaE,
  parseOklchCss,
  resolveNativeColor,
  roundTripDeltaE,
} from '../src/convert.js';
import { classifyTheme, wcagContrast } from '../src/classify.js';
import { toSlug } from '../src/slug.js';
import { COLOR_KEYS } from '../src/types.js';
import type { TerminalColorTheme } from '../src/types.js';

describe('convertHexToColor', () => {
  it('converts Dracula background within expected OKLCH range', () => {
    const c = convertHexToColor('#282a36');
    expect(c.hex).toBe('#282a36');
    expect(c.oklch.l).toBeGreaterThan(0.27);
    expect(c.oklch.l).toBeLessThan(0.31);
    expect(c.oklch.c).toBeLessThan(0.05);
    expect(c.oklchCss).toMatch(/^oklch\(/);
  });

  it('handles pure white deterministically', () => {
    const c = convertHexToColor('#ffffff');
    expect(c.oklch.l).toBeCloseTo(1, 2);
    expect(c.oklch.c).toBeCloseTo(0, 2);
  });

  it('coerces achromatic hue to 0 (no NaN in JSON)', () => {
    const c = convertHexToColor('#000000');
    expect(Number.isFinite(c.oklch.h)).toBe(true);
    expect(c.oklch.h).toBe(0);
    expect(() => JSON.stringify(c)).not.toThrow();
    expect(JSON.stringify(c)).not.toContain('null');
  });

  it('clamps chroma to [0, 0.5]', () => {
    const c = convertHexToColor('#ff0000');
    expect(c.oklch.c).toBeGreaterThan(0);
    expect(c.oklch.c).toBeLessThanOrEqual(0.5);
  });

  it('rejects malformed hex', () => {
    expect(() => convertHexToColor('not-a-color')).toThrow();
  });
});

describe('roundTripDeltaE', () => {
  const samples = [
    '#282a36', // Dracula bg
    '#f8f8f2', // Dracula fg
    '#ff5555', // Dracula red
    '#50fa7b', // Dracula green
    '#bd93f9', // Dracula purple
    '#1d2021', // Gruvbox dark bg
    '#fbf1c7', // Gruvbox light bg
    '#2e3440', // Nord polar night
    '#88c0d0', // Nord frost
  ];

  it.each(samples)('round-trip ΔE2000 < 1.0 for %s', (hex) => {
    expect(roundTripDeltaE(hex)).toBeLessThan(1.0);
  });
});

// Issue #132: native theme sources may author a color slot in OKLCH; hex
// becomes the derived field.
describe('convertOklchToColor', () => {
  it('stores the authored oklch numbers verbatim, not re-derived from hex', () => {
    // Remarque Light background — the exact remarque-tokens design value.
    const c = convertOklchToColor({ l: 0.975, c: 0.005, h: 80 });
    expect(c.oklch).toEqual({ l: 0.975, c: 0.005, h: 80 });
    expect(c.oklchCss).toBe('oklch(0.975 0.005 80)');
  });

  it('derives a valid 6-digit hex from the authored value', () => {
    const c = convertOklchToColor({ l: 0.5, c: 0.14, h: 250 });
    expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('gamut-clamps the derived hex for an out-of-sRGB-gamut authored color, while the authored oklch is unchanged', () => {
    // l=0.9, c=0.4 at h=145 (green) is not displayable in sRGB.
    const c = convertOklchToColor({ l: 0.9, c: 0.4, h: 145 });
    expect(c.oklch).toEqual({ l: 0.9, c: 0.4, h: 145 });
    expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('round-trips an in-gamut authored value back to itself through hex, within rounding', () => {
    const authored = { l: 0.5106, c: 0.1203, h: 250.4 };
    const c = convertOklchToColor(authored);
    const back = convertHexToColor(c.hex);
    expect(back.oklch.l).toBeCloseTo(authored.l, 2);
    expect(back.oklch.c).toBeCloseTo(authored.c, 2);
    expect(back.oklch.h).toBeCloseTo(authored.h, 0);
  });
});

describe('parseOklchCss', () => {
  it('parses a well-formed oklch() CSS string', () => {
    expect(parseOklchCss('oklch(0.975 0.005 80)')).toEqual({ l: 0.975, c: 0.005, h: 80 });
  });

  it('tolerates surrounding whitespace and mixed case', () => {
    expect(parseOklchCss('  OKLCH( 0.5 0.14 250 )  ')).toEqual({ l: 0.5, c: 0.14, h: 250 });
  });

  it('throws on an unparseable string', () => {
    expect(() => parseOklchCss('not-oklch(1 2 3)')).toThrow();
  });
});

describe('resolveNativeColor', () => {
  it('resolves a hex string as hex-authored (unchanged behavior)', () => {
    const { color, authored } = resolveNativeColor('#f8f6f3');
    expect(authored).toBe(false);
    expect(color).toEqual(convertHexToColor('#f8f6f3'));
  });

  it('resolves an oklch() CSS string as OKLCH-authored', () => {
    const { color, authored } = resolveNativeColor('oklch(0.975 0.005 80)');
    expect(authored).toBe(true);
    expect(color.oklch).toEqual({ l: 0.975, c: 0.005, h: 80 });
  });

  it('resolves an {l, c, h} object as OKLCH-authored', () => {
    const { color, authored } = resolveNativeColor({ l: 0.18, c: 0.01, h: 80 });
    expect(authored).toBe(true);
    expect(color.oklch).toEqual({ l: 0.18, c: 0.01, h: 80 });
  });
});

describe('oklchRoundTripDeltaE', () => {
  it('is < 1.0 for an in-gamut authored value (inverted direction: oklch -> hex -> oklch)', () => {
    expect(oklchRoundTripDeltaE({ l: 0.975, c: 0.005, h: 80 })).toBeLessThan(1.0);
    expect(oklchRoundTripDeltaE({ l: 0.5, c: 0.14, h: 250 })).toBeLessThan(1.0);
  });

  it('reflects gamut-clamping loss for an out-of-gamut authored value', () => {
    // Same aggressively out-of-gamut color as the convertOklchToColor test —
    // clamping necessarily moves it, so the round-trip ΔE should be nonzero.
    expect(oklchRoundTripDeltaE({ l: 0.9, c: 0.4, h: 145 })).toBeGreaterThan(0);
  });
});

describe('toSlug', () => {
  it.each([
    ['Dracula', 'dracula'],
    ['Tokyo Night', 'tokyo-night'],
    ['Solarized Dark (Higher Contrast)', 'solarized-dark-higher-contrast'],
    ['c64 (Light)', 'c64-light'],
    ['Argonaut', 'argonaut'],
    ['Builtin Solarized Dark', 'builtin-solarized-dark'],
    ['Material+', 'material-plus'],
  ])('%s -> %s', (input, expected) => {
    expect(toSlug(input)).toBe(expected);
  });
});

describe('classifyTheme', () => {
  // Per-ANSI-slot overrides let tests drive minAnsi / minAnsiSlot deterministically.
  const makeTheme = (
    bgHex: string,
    fgHex: string,
    ansi: Partial<Record<string, string>> = {},
    overrides: Partial<TerminalColorTheme> = {},
  ): TerminalColorTheme => {
    const colors = Object.fromEntries(
      COLOR_KEYS.map((k) => {
        if (k === 'background') return [k, convertHexToColor(bgHex)];
        if (k === 'foreground') return [k, convertHexToColor(fgHex)];
        const hex = ansi[k] ?? '#808080';
        return [k, convertHexToColor(hex)];
      }),
    ) as TerminalColorTheme['colors'];
    return {
      name: 'T',
      slug: 't',
      isDark: false,
      tags: [],
      source: 'iterm2-color-schemes',
      sourceUrl: 'https://example.com',
      upstreamSha: 'abc1234',
      updatedAt: '2026-04-14T00:00:00.000Z',
      colors,
      contrast: { fgOnBg: 0, minAnsi: 0, minAnsiSlot: 'foreground' },
      ...overrides,
    };
  };

  // A fully brightness-ordered ANSI palette: every `bright*` slot strictly
  // lighter than its normal counterpart. Used as the "well-formed" baseline
  // for the brightness-monotonicity tests below.
  const orderedAnsi: Record<string, string> = {
    black: '#202020',
    brightBlack: '#404040',
    red: '#600000',
    brightRed: '#c00000',
    green: '#006000',
    brightGreen: '#00c000',
    yellow: '#606000',
    brightYellow: '#c0c000',
    blue: '#000060',
    brightBlue: '#0000c0',
    purple: '#600060',
    brightPurple: '#c000c0',
    cyan: '#006060',
    brightCyan: '#00c0c0',
    white: '#909090',
    brightWhite: '#c0c0c0',
  };

  it('tags dark theme with low background lightness', () => {
    const t = makeTheme('#000000', '#ffffff');
    classifyTheme(t);
    expect(t.isDark).toBe(true);
    expect(t.tags).toContain('dark');
    expect(t.tags).toContain('high-contrast');
  });

  it('tags light theme with high background lightness', () => {
    const t = makeTheme('#ffffff', '#000000');
    classifyTheme(t);
    expect(t.isDark).toBe(false);
    expect(t.tags).toContain('light');
  });

  it('marks popular themes by slug keyword', () => {
    const t = makeTheme('#282a36', '#f8f8f2', {}, { slug: 'dracula' });
    classifyTheme(t);
    expect(t.tags).toContain('popular');
  });

  it('populates contrast.fgOnBg with the WCAG body-text ratio', () => {
    const t = makeTheme('#000000', '#ffffff');
    classifyTheme(t);
    // Pure black on pure white is the 21:1 theoretical maximum.
    expect(t.contrast.fgOnBg).toBeCloseTo(21, 1);
    expect(t.tags).toContain('wcag-aaa');
    expect(t.tags).toContain('wcag-aa');
  });

  it('tags wcag-aa but not wcag-aaa for a ratio between 4.5 and 7', () => {
    // #767676 on #ffffff is ~4.54:1 — just above AA, below AAA.
    const t = makeTheme('#ffffff', '#767676');
    classifyTheme(t);
    expect(t.contrast.fgOnBg).toBeGreaterThanOrEqual(4.5);
    expect(t.contrast.fgOnBg).toBeLessThan(7);
    expect(t.tags).toContain('wcag-aa');
    expect(t.tags).not.toContain('wcag-aaa');
  });

  it('tags wcag-aa-large (not wcag-aa) for a ratio between 3 and 4.5', () => {
    // #949494 on #ffffff is ~3.03:1 — AA-large only.
    const t = makeTheme('#ffffff', '#949494');
    classifyTheme(t);
    expect(t.contrast.fgOnBg).toBeGreaterThanOrEqual(3);
    expect(t.contrast.fgOnBg).toBeLessThan(4.5);
    expect(t.tags).toContain('wcag-aa-large');
    expect(t.tags).not.toContain('wcag-aa');
  });

  it('tags wcag-fail when fg/bg contrast drops below 3:1', () => {
    const t = makeTheme('#ffffff', '#c0c0c0');
    classifyTheme(t);
    expect(t.contrast.fgOnBg).toBeLessThan(3);
    expect(t.tags).toContain('wcag-fail');
  });

  it('minAnsi excludes black + brightBlack on dark themes', () => {
    // bg=#000. black/brightBlack identical to bg (would zero out minAnsi
    // if included). Red = #c00 gives a specific ratio we can pin.
    const t = makeTheme('#000000', '#ffffff', {
      black: '#000000',
      brightBlack: '#000000',
      red: '#cc0000',
    });
    classifyTheme(t);
    expect(t.contrast.minAnsiSlot).not.toBe('black');
    expect(t.contrast.minAnsiSlot).not.toBe('brightBlack');
    // Red is the worst non-blend slot here.
    expect(t.contrast.minAnsiSlot).toBe('red');
    const expected = wcagContrast('#000000', '#cc0000');
    expect(t.contrast.minAnsi).toBeCloseTo(expected, 5);
  });

  it('minAnsi excludes white + brightWhite on light themes', () => {
    const t = makeTheme('#ffffff', '#000000', {
      white: '#ffffff',
      brightWhite: '#ffffff',
      yellow: '#ffdd00',
    });
    classifyTheme(t);
    expect(t.contrast.minAnsiSlot).not.toBe('white');
    expect(t.contrast.minAnsiSlot).not.toBe('brightWhite');
  });

  it('tags ansi-legible when all non-blend ANSI slots clear 3:1', () => {
    const t = makeTheme('#000000', '#ffffff', {
      black: '#000000',
      brightBlack: '#000000',
      // The remaining 14 slots default to #808080 ≈ 5.3:1 on pure black.
    });
    classifyTheme(t);
    expect(t.contrast.minAnsi).toBeGreaterThanOrEqual(3);
    expect(t.tags).toContain('ansi-legible');
  });

  // Issue #145: cursor-vs-background contrast.
  describe('cursorOnBg / cursor-visible', () => {
    it('tags cursor-visible when cursor clears the 3:1 non-text floor', () => {
      // #949494 on #ffffff is ~3.03:1 (same pinned pair as the wcag-aa-large
      // boundary test above, applied here to the cursor slot instead of fg).
      const t = makeTheme('#ffffff', '#000000', { cursor: '#949494' });
      classifyTheme(t);
      expect(t.contrast.cursorOnBg).toBeGreaterThanOrEqual(3);
      expect(t.tags).toContain('cursor-visible');
    });

    it('omits cursor-visible when cursor is below 3:1', () => {
      // #c0c0c0 on #ffffff is <3:1 (same pinned pair as the wcag-fail test).
      const t = makeTheme('#ffffff', '#000000', { cursor: '#c0c0c0' });
      classifyTheme(t);
      expect(t.contrast.cursorOnBg).toBeLessThan(3);
      expect(t.tags).not.toContain('cursor-visible');
    });

    it('computes cursorOnBg as background-vs-cursor WCAG ratio', () => {
      const t = makeTheme('#000000', '#ffffff', { cursor: '#ffffff' });
      classifyTheme(t);
      expect(t.contrast.cursorOnBg).toBeCloseTo(21, 1);
    });
  });

  // Issue #145: selection legibility — foreground vs selection-background,
  // since the schema has no dedicated selected-text-color slot.
  describe('selectionContrast / selection-legible', () => {
    it('tags selection-legible when fg-on-selection clears 4.5:1', () => {
      // fg #ffffff vs selection #767676 is ~4.54:1 (same pinned pair as the
      // wcag-aa boundary test above, applied to fg-vs-selection).
      const t = makeTheme('#000000', '#ffffff', { selection: '#767676' });
      classifyTheme(t);
      expect(t.contrast.selectionContrast).toBeGreaterThanOrEqual(4.5);
      expect(t.tags).toContain('selection-legible');
    });

    it('omits selection-legible when fg-on-selection is between 3 and 4.5', () => {
      // fg #ffffff vs selection #949494 is ~3.03:1 — clears ansi-legible-style
      // 3:1 but not the 4.5:1 selection-legible bar.
      const t = makeTheme('#000000', '#ffffff', { selection: '#949494' });
      classifyTheme(t);
      expect(t.contrast.selectionContrast).toBeGreaterThanOrEqual(3);
      expect(t.contrast.selectionContrast).toBeLessThan(4.5);
      expect(t.tags).not.toContain('selection-legible');
    });

    it('computes selectionContrast as foreground-vs-selection WCAG ratio', () => {
      const t = makeTheme('#000000', '#ffffff', { selection: '#000000' });
      classifyTheme(t);
      expect(t.contrast.selectionContrast).toBeCloseTo(21, 1);
    });
  });

  // Issue #145: brightness-monotonicity — bright* slots must be strictly
  // lighter than their normal counterpart across all 8 pairs.
  describe('brightnessOrdered / brightnessViolations / brightness-ordered tag', () => {
    it('reports ordered with no violations when every bright slot is lighter than normal', () => {
      const t = makeTheme('#000000', '#ffffff', orderedAnsi);
      classifyTheme(t);
      expect(t.contrast.brightnessOrdered).toBe(true);
      expect(t.contrast.brightnessViolations).toEqual([]);
      expect(t.tags).toContain('brightness-ordered');
    });

    it('flags a known real-world-style violator: brightBlack darker than black', () => {
      const t = makeTheme('#000000', '#ffffff', {
        ...orderedAnsi,
        // Swapped relative to orderedAnsi: brightBlack is now DARKER than
        // black, the exact bug class from microsoft/terminal #12957/#5384.
        black: '#404040',
        brightBlack: '#202020',
      });
      classifyTheme(t);
      expect(t.contrast.brightnessOrdered).toBe(false);
      expect(t.contrast.brightnessViolations).toEqual(['brightBlack']);
      expect(t.tags).not.toContain('brightness-ordered');
    });

    it('lists every violating bright slot, not just the first', () => {
      const t = makeTheme('#000000', '#ffffff', {
        ...orderedAnsi,
        black: '#404040',
        brightBlack: '#202020',
        white: '#c0c0c0',
        brightWhite: '#909090',
      });
      classifyTheme(t);
      expect(t.contrast.brightnessOrdered).toBe(false);
      expect(t.contrast.brightnessViolations).toEqual(['brightBlack', 'brightWhite']);
    });

    it('treats an equal-lightness pair as a violation (strictly-greater required)', () => {
      const t = makeTheme('#000000', '#ffffff', {
        ...orderedAnsi,
        red: '#600000',
        brightRed: '#600000',
      });
      classifyTheme(t);
      expect(t.contrast.brightnessOrdered).toBe(false);
      expect(t.contrast.brightnessViolations).toContain('brightRed');
    });
  });
});
