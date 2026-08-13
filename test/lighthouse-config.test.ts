import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two Lighthouse configs exist so CI measures both profiles (#218): mobile is
// where main-thread work hurts most and it was never being measured.
//
// They MUST differ only in `collect.settings.preset`. Duplicated assertion
// blocks are exactly the kind of thing that drifts silently — one profile
// quietly stops enforcing what the other does — so the duplication is pinned
// here rather than trusted.

const ROOT = join(import.meta.dirname, '..');
const read = (name: string): Record<string, never> =>
  JSON.parse(readFileSync(join(ROOT, 'site', name), 'utf8')) as Record<string, never>;

const desktop = read('.lighthouserc.json') as unknown as LhciConfig;
const mobile = read('.lighthouserc.mobile.json') as unknown as LhciConfig;

interface LhciConfig {
  ci: {
    collect: { settings: { preset?: string; skipAudits: string[] }; numberOfRuns: number };
    assert: { assertions: Record<string, unknown> };
    upload: Record<string, unknown>;
  };
}

describe('lighthouse configs', () => {
  it('assert the same things on both profiles', () => {
    expect(mobile.ci.assert).toEqual(desktop.ci.assert);
  });

  it('collect identically apart from the preset', () => {
    const stripPreset = (s: LhciConfig['ci']['collect']['settings']): Record<string, unknown> => {
      const copy: Record<string, unknown> = { ...s };
      delete copy['preset'];
      return copy;
    };
    expect(stripPreset(mobile.ci.collect.settings)).toEqual(
      stripPreset(desktop.ci.collect.settings),
    );
    const mobilePreset = mobile.ci.collect.settings.preset;
    expect(desktop.ci.collect.settings.preset).toBe('desktop');
    // Mobile is Lighthouse's DEFAULT emulation, not a preset. `preset:
    // "mobile"` is rejected outright: "Choices: perf, experimental, desktop".
    expect(mobilePreset).toBeUndefined();
  });

  it('runs each profile enough times to be stable', () => {
    expect(desktop.ci.collect.numberOfRuns).toBeGreaterThanOrEqual(3);
    expect(mobile.ci.collect.numberOfRuns).toBe(desktop.ci.collect.numberOfRuns);
  });

  it('gates performance as an error, not a warning', () => {
    // The whole point of #218: a 1.7 MB document could never block CI while
    // this was `warn`. Both profiles measure 100 after the #211 fix.
    expect(desktop.ci.assert.assertions['categories:performance']).toEqual([
      'error',
      { minScore: 0.8 },
    ]);
  });

  it('asserts color-contrast rather than switching it off', () => {
    // Lighthouse cannot scope an audit to a subtree, so #218's proposed
    // ".showcase-only exception" is not expressible. It passes in CI as-is,
    // so the honest configuration is to assert it.
    expect(desktop.ci.assert.assertions['color-contrast']).toBe('error');
  });
});
