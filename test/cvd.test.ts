import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { differenceCiede2000, parse } from 'culori';
import { describe, expect, it } from 'vitest';
import {
  CVD_ANSI_KEYS,
  CVD_SAFE_THRESHOLD,
  computeCvd,
  cvdTags,
  minPairwiseDeltaE,
} from '../src/cvd.js';
import { CvdSchema } from '../src/schema.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorKey, ColorValue, Colors, Cvd } from '../src/types.js';

// computeCvd reads only `colors[key].hex` (culori-parses it directly) — the
// `oklch`/`oklchCss` fields are irrelevant to this module, unlike the
// oklch-driven fixtures in test/dataviz.test.ts / test/accent.test.ts. So
// fixtures here just need real, parseable hex strings.
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

describe('minPairwiseDeltaE', () => {
  it('is 0 for a list containing an exact duplicate', () => {
    const red = parse('#ff0000');
    if (red === undefined) throw new Error('unreachable');
    expect(minPairwiseDeltaE([red, red, parse('#00ff00')!])).toBe(0);
  });

  it('matches a direct differenceCiede2000 call for exactly two colors', () => {
    const a = parse('#ff0000')!;
    const b = parse('#00ff00')!;
    expect(minPairwiseDeltaE([a, b])).toBe(differenceCiede2000()(a, b));
  });

  it('picks the smallest pairwise distance among more than two colors', () => {
    const a = parse('#000000')!; // black
    const b = parse('#ffffff')!; // white — far from black
    const c = parse('#010101')!; // near-black — closest to `a`
    const direct = differenceCiede2000()(a, c);
    expect(minPairwiseDeltaE([a, b, c])).toBeCloseTo(direct, 10);
  });
});

describe('CVD_ANSI_KEYS', () => {
  it('is the 6 classic (non-bright) chromatic ANSI slots', () => {
    expect(CVD_ANSI_KEYS).toEqual(['red', 'green', 'yellow', 'blue', 'purple', 'cyan']);
  });
});

describe('computeCvd', () => {
  it('is deterministic', () => {
    const colors = makeColors({
      red: '#d55e00',
      green: '#009e73',
      yellow: '#f0e442',
      blue: '#0072b2',
      purple: '#cc79a7',
      cyan: '#56b4e9',
    });
    expect(computeCvd(colors)).toEqual(computeCvd(colors));
  });

  it('returns finite, nonnegative scores for all three deficiencies', () => {
    const colors = makeColors({
      red: '#d55e00',
      green: '#009e73',
      yellow: '#f0e442',
      blue: '#0072b2',
      purple: '#cc79a7',
      cyan: '#56b4e9',
    });
    const cvd = computeCvd(colors);
    for (const v of [cvd.deuteranopia, cvd.protanopia, cvd.tritanopia]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('scores the canonical Okabe-Ito 6-hue set safe under both deuteranopia and protanopia', () => {
    // Exact hex values used by data-sources/native/wong-dark.json's classic
    // ANSI slots — the standard Okabe-Ito palette, the prior-art reference
    // for "designed to be colorblind-safe".
    const colors = makeColors({
      red: '#d55e00',
      green: '#009e73',
      yellow: '#f0e442',
      blue: '#0072b2',
      purple: '#cc79a7',
      cyan: '#56b4e9',
    });
    const cvd = computeCvd(colors);
    expect(cvd.deuteranopia).toBeGreaterThanOrEqual(CVD_SAFE_THRESHOLD);
    expect(cvd.protanopia).toBeGreaterThanOrEqual(CVD_SAFE_THRESHOLD);
    expect(cvdTags(cvd)).toEqual(['cvd-safe']);
  });

  it("scores a near-isoluminant red/green pair (mirage's real red/green — see data/by-name/mirage.json) as cvd-caution", () => {
    const colors = makeColors({
      red: '#ff9999',
      green: '#85cc95',
      yellow: '#ffd700',
      blue: '#7fb5ff',
      purple: '#ddb3ff',
      cyan: '#21c7a8',
    });
    const cvd = computeCvd(colors);
    // Near-total collapse under deuteranopia — see src/cvd.ts module doc.
    expect(cvd.deuteranopia).toBeLessThan(1);
    expect(cvdTags(cvd)).toEqual(['cvd-caution']);
  });
});

describe('cvdTags', () => {
  function cvd(deuteranopia: number, protanopia: number, tritanopia = 0): Cvd {
    return { deuteranopia, protanopia, tritanopia };
  }

  it('is cvd-safe when both deuteranopia and protanopia are >= CVD_SAFE_THRESHOLD', () => {
    expect(cvdTags(cvd(CVD_SAFE_THRESHOLD, CVD_SAFE_THRESHOLD))).toEqual(['cvd-safe']);
    expect(cvdTags(cvd(20, 20))).toEqual(['cvd-safe']);
  });

  it('is cvd-caution when deuteranopia is just below the threshold', () => {
    expect(cvdTags(cvd(CVD_SAFE_THRESHOLD - 0.001, 20))).toEqual(['cvd-caution']);
  });

  it('is cvd-caution when protanopia is just below the threshold', () => {
    expect(cvdTags(cvd(20, CVD_SAFE_THRESHOLD - 0.001))).toEqual(['cvd-caution']);
  });

  it('ignores tritanopia when deciding the tag', () => {
    expect(cvdTags(cvd(20, 20, 0))).toEqual(['cvd-safe']);
    expect(cvdTags(cvd(0, 0, 100))).toEqual(['cvd-caution']);
  });
});

describe('CvdSchema', () => {
  it('accepts a well-formed cvd block', () => {
    expect(
      CvdSchema.safeParse({ deuteranopia: 12.3, protanopia: 10.1, tritanopia: 8.5 }).success,
    ).toBe(true);
  });

  it('rejects a negative score', () => {
    expect(CvdSchema.safeParse({ deuteranopia: -1, protanopia: 10, tritanopia: 8 }).success).toBe(
      false,
    );
  });

  it('rejects a non-finite score', () => {
    expect(
      CvdSchema.safeParse({ deuteranopia: Infinity, protanopia: 10, tritanopia: 8 }).success,
    ).toBe(false);
  });
});

describe('real-data sanity: wong-* (Okabe-Ito) themes must be cvd-safe', () => {
  const ROOT = resolve(new URL('../', import.meta.url).pathname);

  function loadTheme(slug: string): { cvd: Cvd; tags: string[] } {
    return JSON.parse(readFileSync(join(ROOT, 'data', 'by-name', `${slug}.json`), 'utf8')) as {
      cvd: Cvd;
      tags: string[];
    };
  }

  it.each(['wong-colorblind-safe-dark', 'wong-colorblind-safe-light'])(
    '%s scores cvd-safe (deuteranopia and protanopia both >= threshold)',
    (slug) => {
      const { cvd, tags } = loadTheme(slug);
      expect(cvd.deuteranopia).toBeGreaterThanOrEqual(CVD_SAFE_THRESHOLD);
      expect(cvd.protanopia).toBeGreaterThanOrEqual(CVD_SAFE_THRESHOLD);
      expect(tags).toContain('cvd-safe');
      expect(tags).not.toContain('cvd-caution');
    },
  );

  it('mirage (real corpus theme, isoluminant red/green) scores cvd-caution', () => {
    const { cvd, tags } = loadTheme('mirage');
    expect(cvd.deuteranopia).toBeLessThan(CVD_SAFE_THRESHOLD);
    expect(tags).toContain('cvd-caution');
    expect(tags).not.toContain('cvd-safe');
  });
});
