import { describe, expect, it } from 'vitest';
import { convertHexToColor, roundTripDeltaE } from '../src/convert.js';
import { classifyTheme } from '../src/classify.js';
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
  const makeTheme = (bgHex: string, fgHex: string, overrides: Partial<TerminalColorTheme> = {}): TerminalColorTheme => {
    const colors = Object.fromEntries(
      COLOR_KEYS.map((k) => {
        if (k === 'background') return [k, convertHexToColor(bgHex)];
        if (k === 'foreground') return [k, convertHexToColor(fgHex)];
        return [k, convertHexToColor('#808080')];
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
    const t = makeTheme('#282a36', '#f8f8f2', { slug: 'dracula' });
    classifyTheme(t);
    expect(t.tags).toContain('popular');
  });
});
