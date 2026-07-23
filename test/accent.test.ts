import { describe, expect, it } from 'vitest';
import {
  ACCENT_ANSI_ORDER,
  CURATED_ACCENT_OVERRIDES,
  computeAccent,
  computeAccentSource,
  findAccentErrors,
  toAccentSlim,
} from '../src/accent.js';
import { AccentSchema, TerminalColorThemeSchema } from '../src/schema.js';
import { COLOR_KEYS } from '../src/types.js';
import type { AccentSlotKey, ColorKey, ColorValue, Colors, Oklch } from '../src/types.js';

// Minimal, deterministic fixture builder — no reliance on real hex<->OKLCH
// conversion so exact chroma values (including ties) are trivial to author.
// hex/oklchCss are just tagged placeholders; findAccentErrors only checks
// that an `accent` matches its own `colors[source]` field-for-field, which
// holds here because computeAccent copies straight from the same Colors
// object these fixtures build.
function cv(l: number, c: number, h: number): ColorValue {
  return {
    hex: `#${l}${c}${h}`.slice(0, 7).padEnd(7, '0'),
    oklch: { l, c, h },
    oklchCss: `oklch(${l} ${c} ${h})`,
  };
}

function makeColors(overrides: Partial<Record<ColorKey, Oklch>> = {}): Colors {
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    const o = overrides[key] ?? { l: 0.5, c: 0.01, h: 0 };
    colors[key] = cv(o.l, o.c, o.h);
  }
  return colors;
}

describe('computeAccentSource / computeAccent — cursor-chromatic case', () => {
  it('picks cursor when its chroma is >= 0.05', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } });
    expect(computeAccentSource('t', colors)).toBe('cursor');
    expect(computeAccent('t', colors)).toEqual({ source: 'cursor', ...colors.cursor });
  });

  it('treats c === 0.05 (the boundary) as chromatic', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.05, h: 10 } });
    expect(computeAccentSource('t', colors)).toBe('cursor');
  });

  it('treats a cursor just below the boundary (c = 0.0499) as neutral', () => {
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.0499, h: 10 },
      blue: { l: 0.5, c: 0.02, h: 250 },
    });
    expect(computeAccentSource('t', colors)).not.toBe('cursor');
  });
});

describe('computeAccentSource / computeAccent — neutral-cursor falls back to most-chromatic ANSI', () => {
  it('picks the most-chromatic of the six classic ANSI colors', () => {
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.01, h: 0 },
      blue: { l: 0.5, c: 0.05, h: 250 },
      purple: { l: 0.5, c: 0.08, h: 300 },
      red: { l: 0.5, c: 0.03, h: 25 },
      green: { l: 0.5, c: 0.02, h: 140 },
      cyan: { l: 0.5, c: 0.01, h: 195 },
      yellow: { l: 0.5, c: 0.04, h: 85 },
    });
    expect(computeAccentSource('t', colors)).toBe('purple');
    expect(computeAccent('t', colors)).toEqual({ source: 'purple', ...colors.purple });
  });

  it('ignores non-classic ANSI slots (black/white/bright*) entirely', () => {
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.01, h: 0 },
      brightRed: { l: 0.5, c: 0.4, h: 25 }, // far more chromatic, but not a candidate
      blue: { l: 0.5, c: 0.02, h: 250 },
      purple: { l: 0.5, c: 0.01, h: 300 },
      red: { l: 0.5, c: 0.01, h: 25 },
      green: { l: 0.5, c: 0.01, h: 140 },
      cyan: { l: 0.5, c: 0.01, h: 195 },
      yellow: { l: 0.5, c: 0.01, h: 85 },
    });
    expect(computeAccentSource('t', colors)).toBe('blue');
  });
});

describe('computeAccentSource — tie-order determinism', () => {
  it('resolves a blue/red tie in favor of blue (earlier in ACCENT_ANSI_ORDER)', () => {
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.01, h: 0 },
      blue: { l: 0.5, c: 0.06, h: 250 },
      red: { l: 0.5, c: 0.06, h: 25 },
    });
    expect(computeAccentSource('t', colors)).toBe('blue');
  });

  it('resolves a red/green tie in favor of red (earlier in ACCENT_ANSI_ORDER)', () => {
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.01, h: 0 },
      red: { l: 0.5, c: 0.07, h: 25 },
      green: { l: 0.5, c: 0.07, h: 140 },
    });
    expect(computeAccentSource('t', colors)).toBe('red');
  });

  it('resolves an all-six-way tie in favor of blue, the first tie-break slot', () => {
    const tiedOverrides = Object.fromEntries(
      ACCENT_ANSI_ORDER.map((name, i) => [name, { l: 0.5, c: 0.06, h: i * 60 }]),
    ) as Partial<Record<ColorKey, Oklch>>;
    const colors = makeColors({ cursor: { l: 0.5, c: 0.01, h: 0 }, ...tiedOverrides });
    expect(computeAccentSource('t', colors)).toBe(ACCENT_ANSI_ORDER[0]);
  });

  it('ACCENT_ANSI_ORDER is exactly [blue, purple, red, green, cyan, yellow]', () => {
    expect(ACCENT_ANSI_ORDER).toEqual(['blue', 'purple', 'red', 'green', 'cyan', 'yellow']);
  });
});

describe('override mechanism', () => {
  it('uses an explicit override map instead of the heuristic when the slug matches', () => {
    // Cursor is chromatic here — the heuristic would normally pick 'cursor'
    // — but an override for this slug should win outright.
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.14, h: 250 },
      green: { l: 0.4, c: 0.1, h: 140 },
    });
    const overrides: Readonly<Record<string, AccentSlotKey>> = { 'weird-theme': 'green' };
    expect(computeAccentSource('weird-theme', colors, overrides)).toBe('green');
    expect(computeAccent('weird-theme', colors, overrides)).toEqual({
      source: 'green',
      ...colors.green,
    });
  });

  it('falls back to the heuristic for a slug not present in the override map', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } });
    const overrides: Readonly<Record<string, AccentSlotKey>> = { 'some-other-theme': 'green' };
    expect(computeAccentSource('unrelated-theme', colors, overrides)).toBe('cursor');
  });

  it('CURATED_ACCENT_OVERRIDES is seeded empty — no heuristic miss has been reviewed yet (issue #133)', () => {
    expect(CURATED_ACCENT_OVERRIDES).toEqual({});
  });

  it('computeAccentSource/computeAccent default to CURATED_ACCENT_OVERRIDES when no override map is passed', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } });
    // With the seeded-empty default map, every slug falls through to the heuristic.
    expect(computeAccentSource('anything', colors)).toBe('cursor');
  });
});

describe('toAccentSlim', () => {
  it('keeps only source + oklchCss, dropping hex and the full oklch object', () => {
    const accent = computeAccent('t', makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } }));
    expect(toAccentSlim(accent)).toEqual({ source: 'cursor', oklchCss: accent.oklchCss });
    expect(toAccentSlim(accent)).not.toHaveProperty('hex');
    expect(toAccentSlim(accent)).not.toHaveProperty('oklch');
  });
});

describe('findAccentErrors', () => {
  it('passes when accent exactly references its own colors[source]', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } });
    const accent = computeAccent('t', colors);
    expect(findAccentErrors([{ slug: 't', colors, accent }])).toEqual([]);
  });

  it('ignores themes with no accent', () => {
    expect(findAccentErrors([{ slug: 't', colors: makeColors() }])).toEqual([]);
  });

  it('rejects a source that is not "cursor" or a known ANSI key', () => {
    const colors = makeColors();
    const errors = findAccentErrors([
      {
        slug: 't',
        colors,
        accent: { source: 'background' as AccentSlotKey, ...colors.background },
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not "cursor" or a known ANSI key');
  });

  it('rejects an accent whose carried color does not exactly equal colors[source]', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } });
    const accent = computeAccent('t', colors);
    const tampered = { ...accent, hex: '#000000' };
    const errors = findAccentErrors([{ slug: 't', colors, accent: tampered }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('does not exactly equal colors.cursor');
  });

  it('rejects a mismatched oklch even when hex/oklchCss match', () => {
    const colors = makeColors({ cursor: { l: 0.5, c: 0.14, h: 250 } });
    const accent = computeAccent('t', colors);
    const tampered = { ...accent, oklch: { l: 0.5, c: 0.14, h: 251 } };
    const errors = findAccentErrors([{ slug: 't', colors, accent: tampered }]);
    expect(errors).toHaveLength(1);
  });

  it('accumulates one error per offending theme, independently', () => {
    const colorsA = makeColors();
    const colorsB = makeColors();
    const errors = findAccentErrors([
      {
        slug: 'a',
        colors: colorsA,
        accent: { source: 'foreground' as AccentSlotKey, ...colorsA.foreground },
      },
      {
        slug: 'b',
        colors: colorsB,
        accent: { source: 'selection' as AccentSlotKey, ...colorsB.selection },
      },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('a.accent.source');
    expect(errors[1]).toContain('b.accent.source');
  });
});

describe('AccentSchema / TerminalColorThemeSchema — accent field shape', () => {
  it('accepts a well-formed accent', () => {
    const parsed = AccentSchema.safeParse({
      source: 'cursor',
      hex: '#0465af',
      oklch: { l: 0.5, c: 0.14, h: 250 },
      oklchCss: 'oklch(0.5 0.14 250)',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a source outside cursor/ANSI (e.g. "background")', () => {
    const parsed = AccentSchema.safeParse({
      source: 'background',
      hex: '#0465af',
      oklch: { l: 0.5, c: 0.14, h: 250 },
      oklchCss: 'oklch(0.5 0.14 250)',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a malformed hex on the accent', () => {
    const parsed = AccentSchema.safeParse({
      source: 'cursor',
      hex: 'not-a-color',
      oklch: { l: 0.5, c: 0.14, h: 250 },
      oklchCss: 'oklch(0.5 0.14 250)',
    });
    expect(parsed.success).toBe(false);
  });

  const baseTheme = {
    name: 'Test',
    slug: 'test-light',
    isDark: false,
    tags: [],
    source: 'iterm2-color-schemes',
    sourceUrl: 'https://example.com',
    upstreamSha: 'local',
    updatedAt: '2026-01-01T00:00:00.000Z',
    colors: undefined,
    contrast: { fgOnBg: 10, minAnsi: 5, minAnsiSlot: 'black' },
  };

  it('does not introduce a schema error when a well-formed accent is present', () => {
    const parsed = TerminalColorThemeSchema.safeParse({
      ...baseTheme,
      accent: {
        source: 'cursor',
        hex: '#0465af',
        oklch: { l: 0.5, c: 0.14, h: 250 },
        oklchCss: 'oklch(0.5 0.14 250)',
      },
    });
    expect(parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === 'accent')).toEqual(
      [],
    );
  });

  it('is absent (optional) without introducing a schema error', () => {
    const parsed = TerminalColorThemeSchema.safeParse({ ...baseTheme });
    expect(parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === 'accent')).toEqual(
      [],
    );
  });
});
