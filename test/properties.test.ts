import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyTheme, METRIC_DECIMALS, WCAG_THRESHOLDS, wcagContrast } from '../src/classify.js';
import { convertHexToColor, publishedConsistencyDeltaE, round } from '../src/convert.js';
import { toSlug } from '../src/slug.js';
import { COLOR_KEYS } from '../src/types.js';
import type { TerminalColorTheme } from '../src/types.js';

// Property-based tests: the data-pipeline invariants of CODING_STANDARDS §5,
// checked against generated inputs rather than the fixtures and the current
// corpus alone. A new upstream theme is, in effect, an arbitrary hex palette,
// so these are the guarantees a future sync relies on.

const hexColor = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => `#${n.toString(16).padStart(6, '0')}`);
// Upstream hex is not always lowercase.
const anyCaseHex = fc
  .tuple(hexColor, fc.boolean())
  .map(([h, upper]) => (upper ? h.toUpperCase() : h));

describe('convertHexToColor (property)', () => {
  it('emits JSON-safe OKLCH within the documented ranges for any hex', () => {
    fc.assert(
      fc.property(anyCaseHex, (hex) => {
        const c = convertHexToColor(hex);
        expect(c.hex).toBe(hex.toLowerCase());
        expect(c.oklch.l).toBeGreaterThanOrEqual(0);
        expect(c.oklch.l).toBeLessThanOrEqual(1);
        expect(c.oklch.c).toBeGreaterThanOrEqual(0);
        expect(c.oklch.c).toBeLessThanOrEqual(0.5);
        expect(Number.isFinite(c.oklch.h)).toBe(true);
        expect(c.oklch.h).toBeGreaterThanOrEqual(0);
        expect(c.oklch.h).toBeLessThanOrEqual(360);
        expect(JSON.parse(JSON.stringify(c))).toEqual(c);
      }),
    );
  });

  it('keeps the published oklch and oklchCss within ΔE2000 < 1.0 of the source hex', () => {
    // The validate.ts gate. It measures the *rounded* published values, the
    // step that actually discards information; the unrounded round trip is
    // ~1e-13 and would prove nothing.
    fc.assert(
      fc.property(hexColor, (hex) => {
        const d = publishedConsistencyDeltaE(convertHexToColor(hex));
        expect(d.oklch).toBeLessThan(1.0);
        expect(d.oklchCss).toBeLessThan(1.0);
      }),
      { numRuns: 500 },
    );
  });
});

describe('wcagContrast (property)', () => {
  it('is symmetric, within [1, 21], and 1 for identical colours', () => {
    fc.assert(
      fc.property(hexColor, hexColor, (a, b) => {
        const r = wcagContrast(a, b);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(21 + 1e-9);
        expect(wcagContrast(b, a)).toBeCloseTo(r, 12);
        expect(wcagContrast(a, a)).toBeCloseTo(1, 12);
      }),
    );
  });
});

describe('toSlug (property)', () => {
  it('always yields kebab-case and is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 40 }), (name) => {
        const slug = toSlug(name);
        expect(slug).toMatch(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/);
        expect(toSlug(slug)).toBe(slug);
      }),
    );
  });
});

describe('classifyTheme (property)', () => {
  const palette = fc.array(hexColor, {
    minLength: COLOR_KEYS.length,
    maxLength: COLOR_KEYS.length,
  });

  it('rounds every metric and derives tags consistent with them, for any palette', () => {
    fc.assert(
      fc.property(palette, (hexes) => {
        const colors = Object.fromEntries(
          COLOR_KEYS.map((k, i) => [k, convertHexToColor(hexes[i] ?? '#000000')]),
        ) as TerminalColorTheme['colors'];
        const theme = {
          name: 'P',
          slug: 'p',
          isDark: false,
          tags: [],
          source: 'iterm2-color-schemes',
          sourceUrl: 'https://example.com',
          upstreamSha: 'abc1234',
          updatedAt: '2026-01-01T00:00:00.000Z',
          colors,
        } as unknown as TerminalColorTheme;
        classifyTheme(theme);

        const metrics = [
          theme.contrast.fgOnBg,
          theme.contrast.minAnsi,
          theme.contrast.cursorOnBg ?? 0,
          theme.contrast.selectionContrast ?? 0,
          theme.apca?.fgOnBg ?? 0,
          theme.apca?.minAnsi ?? 0,
          theme.cvd?.deuteranopia ?? 0,
          theme.cvd?.protanopia ?? 0,
          theme.cvd?.tritanopia ?? 0,
        ];
        for (const m of metrics) {
          expect(Number.isFinite(m)).toBe(true);
          expect(round(m, METRIC_DECIMALS)).toBe(m);
        }

        expect(theme.tags.filter((t) => t === 'dark' || t === 'light')).toEqual([
          theme.isDark ? 'dark' : 'light',
        ]);
        const r = theme.contrast.fgOnBg;
        const tier =
          r >= WCAG_THRESHOLDS.aa
            ? 'wcag-aa'
            : r >= WCAG_THRESHOLDS.aaLarge
              ? 'wcag-aa-large'
              : 'wcag-fail';
        expect(theme.tags).toContain(tier);
        expect(theme.tags.includes('wcag-aaa')).toBe(r >= WCAG_THRESHOLDS.aaa);
      }),
      { numRuns: 50 },
    );
  });
});
