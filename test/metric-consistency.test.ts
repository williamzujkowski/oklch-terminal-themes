import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findMetricErrors } from '../src/metric-consistency.js';
import type { TerminalColorTheme } from '../src/types.js';

function fixture(): TerminalColorTheme {
  // Trusted committed fixture, not a production input boundary.
  return JSON.parse(
    readFileSync(new URL('../data/by-name/remarque-dark.json', import.meta.url), 'utf8'),
  ) as TerminalColorTheme;
}

describe('published metric consistency', () => {
  it('accepts actual palette metrics without mutating them', () => {
    const theme = fixture();
    const before = structuredClone(theme);
    expect(findMetricErrors(theme)).toEqual([]);
    expect(theme).toEqual(before);
  });
  it.each(['fgOnBg', 'minAnsi', 'cursorOnBg', 'selectionContrast'] as const)(
    'rejects contradictory contrast.%s',
    (key) => {
      const theme = fixture();
      theme.contrast[key] = 21;
      expect(findMetricErrors(theme)).toContain(
        `remarque-dark.contrast.${key}: does not match canonical palette inputs`,
      );
    },
  );
  it.each(['deuteranopia', 'protanopia', 'tritanopia'] as const)(
    'rejects contradictory cvd.%s',
    (key) => {
      const theme = fixture();
      theme.cvd![key] = 100;
      expect(findMetricErrors(theme)).toContain(
        `remarque-dark.cvd.${key}: does not match canonical palette inputs`,
      );
    },
  );
  it('rejects contradictory APCA polarity/score', () => {
    const theme = fixture();
    theme.apca!.fgOnBg = 0;
    expect(findMetricErrors(theme)).toContain(
      'remarque-dark.apca.fgOnBg: does not match canonical palette inputs',
    );
  });
  it('supports legacy records without supplemental metrics', () => {
    const theme = fixture();
    delete theme.apca;
    delete theme.cvd;
    expect(findMetricErrors(theme)).toEqual([]);
  });
});
