import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_KEYS } from '../src/types.js';
import type { TerminalColorTheme } from '../src/types.js';

// Guards for the threshold rationale added in issue #205.
//
// The doc comments on `chromaTag`, `isDark`, the legacy contrast tags,
// `HUE_DEDUPE_THRESHOLD` and `CHROMATIC_CURSOR_THRESHOLD` make ARGUMENTS about
// this corpus — "the split here is sharp", "the split here is not", "these two
// tags contradict each other". Those arguments are the reason each number is
// defensible, and they can quietly stop being true as themes are added.
//
// These tests pin the claims, deliberately NOT the exact counts. Adding a
// theme should not turn CI red; the distribution changing SHAPE should, because
// that is when the documentation starts lying.

const ROOT = join(import.meta.dirname, '..');
const THEMES = JSON.parse(
  readFileSync(join(ROOT, 'data', 'themes.json'), 'utf8'),
) as TerminalColorTheme[];

const meanChroma = (t: TerminalColorTheme): number =>
  COLOR_KEYS.reduce((sum, k) => sum + t.colors[k].oklch.c, 0) / COLOR_KEYS.length;

const share = (n: number): number => n / THEMES.length;

describe('isDark at OKLCH L 0.5 (src/classify.ts)', () => {
  it('sits in an empty band, which is why the exact value does not matter', () => {
    // The doc claims the corpus is sharply bimodal here. If a wave of
    // mid-lightness themes ever arrived, the "any cut in this range
    // classifies the identical set" argument would collapse and the threshold
    // would need a real justification instead.
    const inBand = THEMES.filter((t) => {
      const l = t.colors.background.oklch.l;
      return l >= 0.4 && l < 0.6;
    });
    expect(share(inBand.length)).toBeLessThan(0.02);
  });

  it('classifies identically for any cut in [0.49, 0.50]', () => {
    // The inert range is (0.4836, 0.5013], bounded by `blue-dolphin` just
    // below and `grass` just above. An earlier draft of the doc claimed
    // [0.49, 0.51], which this test caught: 0.51 pulls `grass` across and
    // gives 493.
    const at = (cut: number): number =>
      THEMES.filter((t) => t.colors.background.oklch.l < cut).length;
    expect(at(0.49)).toBe(at(0.5));
    expect(at(0.5013)).toBe(at(0.5));
    expect(at(0.52)).toBeGreaterThan(at(0.5));
  });
});

describe('chromaTag cuts at 0.08 / 0.15 (src/classify.ts)', () => {
  it('cuts through a dense region, which is why the doc calls them conventions', () => {
    // The inverse of the isDark claim: here the doc admits the numbers are
    // arbitrary because the distribution is smooth. This asserts that
    // smoothness rather than a natural boundary, so if a real gap ever opened
    // up the comment would be understating the thresholds.
    const chromas = THEMES.map(meanChroma);
    const between = (lo: number, hi: number): number =>
      chromas.filter((c) => c >= lo && c < hi).length;
    // Neighbourhoods of both cuts are populated — no gap to snap to.
    expect(between(0.07, 0.09)).toBeGreaterThan(THEMES.length * 0.15);
    expect(between(0.14, 0.16)).toBeGreaterThan(0);
  });

  it('keeps `vibrant` a small minority and `muted` a large one', () => {
    // The doc leads with 2.8% vibrant / 31.1% muted. Wide bands, so adding
    // themes is fine; a flip in character is not.
    const vibrant = THEMES.filter((t) => meanChroma(t) > 0.15).length;
    const muted = THEMES.filter((t) => meanChroma(t) < 0.08).length;
    expect(share(vibrant)).toBeLessThan(0.1);
    expect(share(muted)).toBeGreaterThan(0.15);
    expect(share(muted)).toBeLessThan(0.5);
  });
});

describe('legacy high-contrast / low-contrast tags (src/classify.ts)', () => {
  it('still overlaps wcag-aa, the contradiction the doc warns about', () => {
    // `low-contrast` starts below 5 and `wcag-aa` at 4.5, so themes in
    // [4.5, 5) carry both. If this ever becomes empty the warning is stale and
    // should be deleted rather than left to mislead.
    const both = THEMES.filter(
      (t) => t.tags.includes('low-contrast') && t.tags.includes('wcag-aa'),
    );
    expect(both.length).toBeGreaterThan(0);
    for (const t of both) {
      expect(t.contrast.fgOnBg).toBeGreaterThanOrEqual(4.5);
      expect(t.contrast.fgOnBg).toBeLessThan(5);
    }
  });

  it('still tags a majority `high-contrast`, which is why the doc calls it weak', () => {
    const high = THEMES.filter((t) => t.tags.includes('high-contrast')).length;
    expect(share(high)).toBeGreaterThan(0.5);
  });
});

describe('HUE_DEDUPE_THRESHOLD = 20 (src/dataviz.ts)', () => {
  it('leaves extra categorical slots a genuine minority', () => {
    // The doc's argument for 20 over 10 is that extra slots should stay rare
    // enough to mean something. At 10 a fifth of the corpus claimed all 8.
    const sizes = THEMES.map((t) => t.dataviz?.categorical.length ?? 0);
    const beyondFloor = sizes.filter((n) => n > 6).length;
    expect(share(beyondFloor)).toBeGreaterThan(0.05);
    expect(share(beyondFloor)).toBeLessThan(0.4);
  });

  it('never emits a duplicate colour within one categorical palette', () => {
    // The property the dedupe exists for, at the shipped threshold.
    for (const t of THEMES) {
      const cat = t.dataviz?.categorical ?? [];
      expect(new Set(cat).size, `${t.slug} has duplicate categorical colours`).toBe(cat.length);
    }
  });
});

describe('CHROMATIC_CURSOR_THRESHOLD = 0.05 (src/accent.ts)', () => {
  it('is a judgement call: the cursor-chroma distribution has no gap at 0.05', () => {
    // The doc says so explicitly. This pins it, so the "genuine judgement
    // call" framing cannot silently become wrong in either direction.
    const near = THEMES.filter((t) => {
      const c = t.colors.cursor.oklch.c;
      return c >= 0.03 && c < 0.07;
    });
    expect(near.length).toBeGreaterThan(0);
  });

  it('agrees with the accent source actually recorded on each theme', () => {
    // The doc quotes the cursor-path count as matching the build's
    // accent-source summary. Curated overrides can pick another slot, so this
    // checks the implication that holds: a `cursor` accent means the cursor
    // cleared the threshold.
    const viaCursor = THEMES.filter((t) => t.accent?.source === 'cursor');
    expect(viaCursor.length).toBeGreaterThan(0);
    for (const t of viaCursor) {
      expect(t.colors.cursor.oklch.c).toBeGreaterThanOrEqual(0.05);
    }
  });
});
