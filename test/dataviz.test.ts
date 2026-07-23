import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { oklchRoundTripDeltaE } from '../src/convert.js';
import {
  CATEGORICAL_ANSI_KEYS,
  CATEGORICAL_MAX,
  CATEGORICAL_MIN,
  DIVERGING_STEPS,
  SEQUENTIAL_STEPS,
  circularHueDistance,
  computeCategorical,
  computeDataviz,
  computeDiverging,
  computeSequential,
  dedupeByHue,
  findDatavizErrors,
  toDatavizSlim,
} from '../src/dataviz.js';
import { DatavizSchema, TerminalColorThemeSchema } from '../src/schema.js';
import { COLOR_KEYS } from '../src/types.js';
import type { Accent, ColorKey, ColorValue, Colors, Dataviz, Oklch } from '../src/types.js';

// Same minimal, deterministic fixture-builder convention as test/accent.test.ts
// — no reliance on real hex<->OKLCH conversion so exact hue/chroma values
// (including ties and near-duplicates) are trivial to author.
function cv(l: number, c: number, h: number): ColorValue {
  return {
    hex: `#${Math.round(l * 100)
      .toString()
      .padStart(2, '0')}${Math.round(c * 100)
      .toString()
      .padStart(2, '0')}${Math.round(h).toString().padStart(2, '0')}`.slice(0, 7),
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

function accentFrom(colors: Colors, source: Accent['source']): Accent {
  const slot = colors[source];
  return { source, hex: slot.hex, oklch: slot.oklch, oklchCss: slot.oklchCss };
}

// A "remarque-dark"-shaped fixture: 6 hue families (one per classic ANSI
// color), each family's bright variant at nearly the same hue but slightly
// more chromatic — exactly the "bright is a lightened copy of normal" shape
// `dedupeByHue` exists to collapse. Accent is `cursor`, chromatic, hue 250 —
// matching real remarque-dark/remarque-light (both pick `cursor` as accent,
// hue 250; see data/by-name/remarque-{dark,light}.json).
function makeSixFamilyColors(): Colors {
  return makeColors({
    background: { l: 0.16, c: 0.01, h: 80 },
    foreground: { l: 0.9, c: 0.005, h: 80 },
    cursor: { l: 0.68, c: 0.12, h: 250 },
    red: { l: 0.62, c: 0.11, h: 25.7 },
    green: { l: 0.6, c: 0.11, h: 145 },
    yellow: { l: 0.61, c: 0.11, h: 84.3 },
    blue: { l: 0.61, c: 0.11, h: 249.7 },
    purple: { l: 0.62, c: 0.108, h: 309.8 },
    cyan: { l: 0.59, c: 0.1, h: 194.8 },
    brightRed: { l: 0.72, c: 0.129, h: 25.4 },
    brightGreen: { l: 0.7, c: 0.129, h: 144.9 },
    brightYellow: { l: 0.71, c: 0.13, h: 85.3 },
    brightBlue: { l: 0.71, c: 0.129, h: 249.5 },
    brightPurple: { l: 0.72, c: 0.129, h: 310.2 },
    brightCyan: { l: 0.7, c: 0.119, h: 194.8 },
  });
}

describe('circularHueDistance', () => {
  it('is 0 for identical hues', () => {
    expect(circularHueDistance(10, 10)).toBe(0);
  });

  it('wraps around 360', () => {
    expect(circularHueDistance(350, 10)).toBe(20);
  });

  it('caps at 180 for opposite hues', () => {
    expect(circularHueDistance(0, 180)).toBe(180);
  });

  it('is symmetric', () => {
    expect(circularHueDistance(30, 200)).toBe(circularHueDistance(200, 30));
  });
});

describe('dedupeByHue', () => {
  function candidate(
    key: ColorKey,
    l: number,
    c: number,
    h: number,
  ): { key: ColorKey; color: ColorValue } {
    return { key, color: cv(l, c, h) };
  }

  it('collapses two candidates within the hue threshold to the more chromatic one', () => {
    const a = candidate('red', 0.5, 0.1, 25);
    const b = candidate('brightRed', 0.6, 0.15, 27); // 2deg away, more chromatic
    expect(dedupeByHue([a, b])).toEqual([b]);
  });

  it('keeps both candidates when they are far enough apart in hue', () => {
    const a = candidate('red', 0.5, 0.1, 25);
    const b = candidate('blue', 0.5, 0.1, 250);
    expect(dedupeByHue([a, b])).toEqual([a, b]);
  });

  it('is deterministic regardless of which of two near-duplicates is more chromatic', () => {
    const lessChromaticFirst = candidate('red', 0.5, 0.05, 25);
    const moreChromaticSecond = candidate('brightRed', 0.5, 0.2, 30);
    expect(dedupeByHue([lessChromaticFirst, moreChromaticSecond])).toEqual([moreChromaticSecond]);

    const moreChromaticFirst = candidate('brightRed', 0.5, 0.2, 30);
    const lessChromaticSecond = candidate('red', 0.5, 0.05, 25);
    // Order of the *kept* entry follows first-seen position, but content is
    // always the more-chromatic candidate either way.
    expect(dedupeByHue([moreChromaticFirst, lessChromaticSecond])).toEqual([moreChromaticFirst]);
  });
});

describe('computeCategorical', () => {
  it('is deterministic', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    expect(computeCategorical(colors, accent)).toEqual(computeCategorical(colors, accent));
  });

  it('settles at 6 when bright variants dedupe against their normal counterpart', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    expect(computeCategorical(colors, accent)).toHaveLength(6);
  });

  it('starts from the hue closest to the accent (categorical[0])', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor'); // hue 250
    const [first] = computeCategorical(colors, accent);
    expect(circularHueDistance((first as ColorValue).oklch.h, 250)).toBeLessThan(5);
  });

  it('extends to 8 when 8 distinct hue clusters exist among the 12 candidates', () => {
    // 8 classic+bright slots spaced 45deg apart (8 distinct clusters); the
    // remaining 4 bright slots duplicate 4 of those clusters so there are
    // still exactly 12 candidates total but only 8 distinct hues.
    const colors = makeColors({
      cursor: { l: 0.5, c: 0.14, h: 0 },
      red: { l: 0.5, c: 0.1, h: 0 },
      green: { l: 0.5, c: 0.1, h: 45 },
      yellow: { l: 0.5, c: 0.1, h: 90 },
      blue: { l: 0.5, c: 0.1, h: 135 },
      purple: { l: 0.5, c: 0.1, h: 180 },
      cyan: { l: 0.5, c: 0.1, h: 225 },
      brightRed: { l: 0.5, c: 0.1, h: 270 },
      brightGreen: { l: 0.5, c: 0.1, h: 315 },
      brightYellow: { l: 0.5, c: 0.09, h: 2 }, // dup of red
      brightBlue: { l: 0.5, c: 0.09, h: 47 }, // dup of green
      brightPurple: { l: 0.5, c: 0.09, h: 92 }, // dup of yellow
      brightCyan: { l: 0.5, c: 0.09, h: 137 }, // dup of blue
    });
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    expect(categorical).toHaveLength(CATEGORICAL_MAX);
  });

  it('still reaches the 6-color floor for a pathologically monochrome ANSI palette', () => {
    // All 12 chromatic candidates within a few degrees of each other.
    const overrides: Partial<Record<ColorKey, Oklch>> = {
      cursor: { l: 0.5, c: 0.1, h: 100 },
    };
    for (const [i, key] of CATEGORICAL_ANSI_KEYS.entries()) {
      overrides[key] = { l: 0.5, c: 0.05 + i * 0.01, h: 100 + i };
    }
    const colors = makeColors(overrides);
    const accent = accentFrom(colors, 'cursor');
    expect(computeCategorical(colors, accent)).toHaveLength(CATEGORICAL_MIN);
  });

  it('every categorical entry is a reference to its own colors[key]', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    for (const color of categorical) {
      expect(Object.values(colors)).toContainEqual(color);
    }
  });
});

describe('computeSequential', () => {
  it('has SEQUENTIAL_STEPS entries', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    expect(computeSequential(colors, accent)).toHaveLength(SEQUENTIAL_STEPS);
  });

  it('is monotonically increasing in L for a dark theme (dark background, lighter accent)', () => {
    const colors = makeSixFamilyColors(); // background l=0.16, cursor l=0.68
    const accent = accentFrom(colors, 'cursor');
    const ls = computeSequential(colors, accent).map((c) => c.oklch.l);
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]).toBeGreaterThanOrEqual(ls[i - 1] as number);
    }
  });

  it('is monotonically decreasing in L for a light theme (light background, darker accent)', () => {
    const colors = makeColors({
      background: { l: 0.975, c: 0.005, h: 80 },
      cursor: { l: 0.5, c: 0.14, h: 250 },
    });
    const accent = accentFrom(colors, 'cursor');
    const ls = computeSequential(colors, accent).map((c) => c.oklch.l);
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]).toBeLessThanOrEqual(ls[i - 1] as number);
    }
  });

  it('starts near-achromatic (background-anchored, chroma ~0)', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const [first] = computeSequential(colors, accent);
    expect((first as ColorValue).oklch.c).toBeLessThanOrEqual(0.001);
  });

  it('ends at the accent itself (highest emphasis)', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const steps = computeSequential(colors, accent);
    const last = steps[steps.length - 1] as ColorValue;
    expect(last.oklch.l).toBeCloseTo(accent.oklch.l, 3);
    expect(last.oklch.h).toBeCloseTo(accent.oklch.h, 0);
  });

  it('every step round-trips in-gamut (dark theme fixture)', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    for (const step of computeSequential(colors, accent)) {
      expect(oklchRoundTripDeltaE(step.oklch)).toBeLessThan(1.0);
    }
  });

  it('every step round-trips in-gamut (light theme fixture)', () => {
    const colors = makeColors({
      background: { l: 0.975, c: 0.005, h: 80 },
      cursor: { l: 0.5, c: 0.14, h: 250 },
    });
    const accent = accentFrom(colors, 'cursor');
    for (const step of computeSequential(colors, accent)) {
      expect(oklchRoundTripDeltaE(step.oklch)).toBeLessThan(1.0);
    }
  });
});

describe('computeDiverging', () => {
  it('has DIVERGING_STEPS entries (odd)', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    const diverging = computeDiverging(categorical, accent);
    expect(diverging).toHaveLength(DIVERGING_STEPS);
    expect(DIVERGING_STEPS % 2).toBe(1);
  });

  it('has a near-achromatic midpoint', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    const diverging = computeDiverging(categorical, accent);
    const midpoint = diverging[Math.floor(DIVERGING_STEPS / 2)] as ColorValue;
    expect(midpoint.oklch.c).toBeLessThanOrEqual(0.01);
  });

  it('is monotonic in L across the whole array', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    const ls = computeDiverging(categorical, accent).map((c) => c.oklch.l);
    const nonDecreasing = ls.every((v, i) => i === 0 || v >= (ls[i - 1] as number));
    const nonIncreasing = ls.every((v, i) => i === 0 || v <= (ls[i - 1] as number));
    expect(nonDecreasing || nonIncreasing).toBe(true);
  });

  it('anchors one arm on the accent hue and the other on the farthest categorical hue', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    const diverging = computeDiverging(categorical, accent);
    const first = diverging[0] as ColorValue;
    const last = diverging[diverging.length - 1] as ColorValue;
    expect(circularHueDistance(first.oklch.h, accent.oklch.h)).toBeLessThan(1);

    const farthest = categorical.reduce((best, c) =>
      circularHueDistance(c.oklch.h, accent.oklch.h) >
      circularHueDistance(best.oklch.h, accent.oklch.h)
        ? c
        : best,
    );
    expect(circularHueDistance(last.oklch.h, farthest.oklch.h)).toBeLessThan(1);
  });

  it('every step round-trips in-gamut', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const categorical = computeCategorical(colors, accent);
    for (const step of computeDiverging(categorical, accent)) {
      expect(oklchRoundTripDeltaE(step.oklch)).toBeLessThan(1.0);
    }
  });
});

describe('computeDataviz / toDatavizSlim', () => {
  it('computeDataviz assembles all three ramps with the expected lengths', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const dataviz = computeDataviz(colors, accent);
    expect(dataviz.categorical.length).toBeGreaterThanOrEqual(CATEGORICAL_MIN);
    expect(dataviz.categorical.length).toBeLessThanOrEqual(CATEGORICAL_MAX);
    expect(dataviz.sequential).toHaveLength(SEQUENTIAL_STEPS);
    expect(dataviz.diverging).toHaveLength(DIVERGING_STEPS);
  });

  it('computeDataviz is deterministic', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    expect(computeDataviz(colors, accent)).toEqual(computeDataviz(colors, accent));
  });

  it('toDatavizSlim keeps only categorical oklchCss strings', () => {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    const dataviz = computeDataviz(colors, accent);
    const slim = toDatavizSlim(dataviz);
    expect(slim).toEqual({ categorical: dataviz.categorical.map((c) => c.oklchCss) });
    expect(slim).not.toHaveProperty('sequential');
    expect(slim).not.toHaveProperty('diverging');
  });
});

describe('findDatavizErrors', () => {
  function validDataviz(): Dataviz {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    return computeDataviz(colors, accent);
  }

  it('passes for a well-formed dataviz block', () => {
    expect(findDatavizErrors([{ slug: 't', dataviz: validDataviz() }], 1.0)).toEqual([]);
  });

  it('ignores themes with no dataviz', () => {
    expect(findDatavizErrors([{ slug: 't' }], 1.0)).toEqual([]);
  });

  it('flags a categorical array shorter than the minimum', () => {
    const dataviz = validDataviz();
    const tampered = { ...dataviz, categorical: dataviz.categorical.slice(0, 5) };
    const errors = findDatavizErrors([{ slug: 't', dataviz: tampered }], 1.0);
    expect(errors.some((e) => e.includes('categorical') && e.includes('outside'))).toBe(true);
  });

  it('flags a diverging array with an even length', () => {
    const dataviz = validDataviz();
    const tampered = { ...dataviz, diverging: dataviz.diverging.slice(0, 6) };
    const errors = findDatavizErrors([{ slug: 't', dataviz: tampered }], 1.0);
    expect(errors.some((e) => e.includes('diverging') && e.includes('odd'))).toBe(true);
  });

  it('flags a non-monotonic sequential L', () => {
    const dataviz = validDataviz();
    const scrambled = [...dataviz.sequential].reverse();
    scrambled[1] = dataviz.sequential[0] as ColorValue; // break monotonicity
    const tampered = { ...dataviz, sequential: scrambled };
    const errors = findDatavizErrors([{ slug: 't', dataviz: tampered }], 1.0);
    expect(errors.some((e) => e.includes('sequential') && e.includes('monotonic'))).toBe(true);
  });

  it('flags an out-of-gamut sequential/diverging color via round-trip ΔE', () => {
    const dataviz = validDataviz();
    // Same aggressively out-of-gamut oklch used in test/convert.test.ts's
    // oklchRoundTripDeltaE case (l=0.9, c=0.4 — far beyond sRGB at that hue).
    const badColor: ColorValue = {
      hex: '#000000',
      oklch: { l: 0.9, c: 0.4, h: 145 },
      oklchCss: 'oklch(0.9 0.4 145)',
    };
    const tampered = { ...dataviz, sequential: [badColor, ...dataviz.sequential.slice(1)] };
    const errors = findDatavizErrors([{ slug: 't', dataviz: tampered }], 1.0);
    expect(errors.some((e) => e.includes('sequential[0]') && e.includes('ΔE2000'))).toBe(true);
  });

  it('accumulates errors per theme independently', () => {
    const dataviz = validDataviz();
    const shortCategorical = { ...dataviz, categorical: dataviz.categorical.slice(0, 5) };
    const evenDiverging = { ...dataviz, diverging: dataviz.diverging.slice(0, 6) };
    const errors = findDatavizErrors(
      [
        { slug: 'a', dataviz: shortCategorical },
        { slug: 'b', dataviz: evenDiverging },
      ],
      1.0,
    );
    expect(errors.some((e) => e.startsWith('a.'))).toBe(true);
    expect(errors.some((e) => e.startsWith('b.'))).toBe(true);
  });
});

describe('DatavizSchema / TerminalColorThemeSchema — dataviz field shape', () => {
  function makeValidDatavizJson(): unknown {
    const colors = makeSixFamilyColors();
    const accent = accentFrom(colors, 'cursor');
    return computeDataviz(colors, accent);
  }

  it('accepts a well-formed dataviz block', () => {
    expect(DatavizSchema.safeParse(makeValidDatavizJson()).success).toBe(true);
  });

  it('rejects a categorical array shorter than 6', () => {
    const dataviz = makeValidDatavizJson() as Dataviz;
    const parsed = DatavizSchema.safeParse({
      ...dataviz,
      categorical: dataviz.categorical.slice(0, 5),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a diverging array with an even length', () => {
    const dataviz = makeValidDatavizJson() as Dataviz;
    const parsed = DatavizSchema.safeParse({
      ...dataviz,
      diverging: dataviz.diverging.slice(0, 6),
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

  it('does not introduce a schema error when a well-formed dataviz is present', () => {
    const parsed = TerminalColorThemeSchema.safeParse({
      ...baseTheme,
      dataviz: makeValidDatavizJson(),
    });
    expect(
      parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === 'dataviz'),
    ).toEqual([]);
  });

  it('is absent (optional) without introducing a schema error', () => {
    const parsed = TerminalColorThemeSchema.safeParse({ ...baseTheme });
    expect(
      parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === 'dataviz'),
    ).toEqual([]);
  });
});

describe('real-data sanity: remarque-dark / remarque-light', () => {
  const ROOT = resolve(new URL('../', import.meta.url).pathname);

  function loadTheme(slug: string): { colors: Colors; accent: Accent } {
    const raw = JSON.parse(readFileSync(join(ROOT, 'data', 'by-name', `${slug}.json`), 'utf8')) as {
      colors: Colors;
      accent: Accent;
    };
    return raw;
  }

  it.each(['remarque-dark', 'remarque-light'])(
    '%s: categorical[0] hue is close to the accent hue (250)',
    (slug) => {
      const { colors, accent } = loadTheme(slug);
      expect(accent.source).toBe('cursor');
      expect(circularHueDistance(accent.oklch.h, 250)).toBeLessThan(1);

      const [first] = computeCategorical(colors, accent);
      expect(circularHueDistance((first as ColorValue).oklch.h, 250)).toBeLessThan(5);
    },
  );
});
