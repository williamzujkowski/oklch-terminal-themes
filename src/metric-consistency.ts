import { classifyTheme } from './classify.js';
import type { TerminalColorTheme } from './types.js';

/** Validate serialized claims separately from independent metric algorithm tests. */
export function findMetricErrors(theme: TerminalColorTheme): string[] {
  const expected = structuredClone(theme);
  classifyTheme(expected);
  const errors: string[] = [];
  for (const group of ['contrast', 'apca', 'cvd'] as const) {
    const actual = theme[group];
    if (actual === undefined) continue;
    const recomputed = expected[group];
    for (const key of Object.keys(actual)) {
      const measured = actual[key as keyof typeof actual];
      const value = recomputed?.[key as keyof typeof recomputed];
      if (JSON.stringify(measured) !== JSON.stringify(value)) {
        errors.push(`${theme.slug}.${group}.${key}: does not match canonical palette inputs`);
      }
    }
  }
  return errors;
}
