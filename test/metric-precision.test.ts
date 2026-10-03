import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyTheme, METRIC_DECIMALS, WCAG_THRESHOLDS } from '../src/classify.js';
import { convertHexToColor, round } from '../src/convert.js';
import { COLOR_KEYS } from '../src/types.js';
import type { TerminalColorTheme } from '../src/types.js';

// The derived metrics used to be emitted at full float precision, so the
// published bytes depended on the V8 build: Node 22 and Node 24 disagreed in
// the last digit or two (e.g. -27.898196775089108 vs -27.8981967750891) and a
// toolchain bump rewrote ~650 files with no real change. Rounding them to a
// fixed precision, like the OKLCH fields, restores CODING_STANDARDS §5.5
// determinism. Precision is part of the data contract.

type Metrics = Pick<TerminalColorTheme, 'contrast' | 'apca' | 'cvd'>;

function metricValues(t: Metrics): Record<string, number> {
  // `apca`, `cvd` and the newer `contrast` keys are optional on the type but
  // always set by classifyTheme; a missing one surfaces as NaN and fails.
  return {
    'contrast.fgOnBg': t.contrast.fgOnBg,
    'contrast.minAnsi': t.contrast.minAnsi,
    'contrast.cursorOnBg': t.contrast.cursorOnBg ?? Number.NaN,
    'contrast.selectionContrast': t.contrast.selectionContrast ?? Number.NaN,
    'apca.fgOnBg': t.apca?.fgOnBg ?? Number.NaN,
    'apca.minAnsi': t.apca?.minAnsi ?? Number.NaN,
    'cvd.deuteranopia': t.cvd?.deuteranopia ?? Number.NaN,
    'cvd.protanopia': t.cvd?.protanopia ?? Number.NaN,
    'cvd.tritanopia': t.cvd?.tritanopia ?? Number.NaN,
  };
}

function overPrecise(t: Metrics): string[] {
  return Object.entries(metricValues(t))
    .filter(([, v]) => round(v, METRIC_DECIMALS) !== v)
    .map(([k, v]) => `${k}=${String(v)}`);
}

function draculaTheme(): TerminalColorTheme {
  // Real-world palette whose metrics are all irrational before rounding.
  const hex: Partial<Record<string, string>> = {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    purple: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
  };
  const colors = Object.fromEntries(
    COLOR_KEYS.map((k) => [
      k,
      convertHexToColor(hex[k] ?? hex[k.replace('bright', '').toLowerCase()] ?? '#6272a4'),
    ]),
  ) as TerminalColorTheme['colors'];
  return {
    name: 'Dracula',
    slug: 'dracula',
    isDark: false,
    tags: [],
    source: 'iterm2-color-schemes',
    sourceUrl: 'https://example.com',
    upstreamSha: 'abc1234',
    updatedAt: '2026-04-14T00:00:00.000Z',
    colors,
  } as unknown as TerminalColorTheme;
}

describe('derived metric precision', () => {
  it(`classifyTheme emits every metric rounded to ${String(METRIC_DECIMALS)} decimals`, () => {
    const theme = draculaTheme();
    classifyTheme(theme);
    expect(overPrecise(theme)).toEqual([]);
  });

  describe('published corpus (data/themes.json)', () => {
    const themes = JSON.parse(
      readFileSync(new URL('../data/themes.json', import.meta.url), 'utf-8'),
    ) as TerminalColorTheme[];

    it(`stores every metric at ${String(METRIC_DECIMALS)} decimals or fewer`, () => {
      const offenders = themes.flatMap((t) => overPrecise(t).map((m) => `${t.slug}: ${m}`));
      expect(offenders.slice(0, 5)).toEqual([]);
    });

    it('derives the WCAG tags from the published (rounded) contrast', () => {
      // A tag must never disagree with the number shipped next to it, which
      // could happen if tags were computed from the unrounded value.
      const mismatched = themes.filter((t) => {
        const r = t.contrast.fgOnBg;
        const expected =
          r >= WCAG_THRESHOLDS.aa
            ? 'wcag-aa'
            : r >= WCAG_THRESHOLDS.aaLarge
              ? 'wcag-aa-large'
              : 'wcag-fail';
        return (
          !t.tags.includes(expected) || r >= WCAG_THRESHOLDS.aaa !== t.tags.includes('wcag-aaa')
        );
      });
      expect(mismatched.map((t) => t.slug)).toEqual([]);
    });
  });
});
