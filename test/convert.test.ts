import { describe, expect, it } from 'vitest';
import { convertHexToColor, roundTripDeltaE } from '../src/convert.js';
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
});
