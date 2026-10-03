import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { summarizeAttribution, type AttributionSourceLike } from '../src/lib/attribution';

const src = (id: string, license: string, local = false): AttributionSourceLike => ({
  id,
  license,
  ...(local ? { local } : {}),
});

describe('summarizeAttribution', () => {
  it('counts only upstream sources, not the local native set', () => {
    const s = summarizeAttribution([src('a', 'MIT'), src('b', 'MIT'), src('native', 'MIT', true)]);
    expect(s.upstreamCount).toBe(2);
  });

  it('lists each license once, most common first, then alphabetically', () => {
    // MIT 3, Apache-2.0 2, BSD-3-Clause 1.
    const s = summarizeAttribution([
      src('a', 'MIT'),
      src('b', 'BSD-3-Clause'),
      src('c', 'Apache-2.0'),
      src('d', 'MIT'),
      src('e', 'Apache-2.0'),
      src('f', 'MIT'),
    ]);
    expect(s.licenses).toEqual(['MIT', 'Apache-2.0', 'BSD-3-Clause']);
  });

  it('covers every license in the real sources.json', () => {
    // The footer used to credit one MIT upstream while the corpus draws on
    // eleven under three licenses; 0.8.1 fixed the README but not the site.
    const sources = JSON.parse(
      readFileSync(new URL('../../sources.json', import.meta.url), 'utf-8'),
    ) as AttributionSourceLike[];
    const s = summarizeAttribution(sources);
    expect(s.upstreamCount).toBe(sources.filter((x) => x.local !== true).length);
    expect([...s.licenses].sort()).toEqual(
      [...new Set(sources.filter((x) => x.local !== true).map((x) => x.license))].sort(),
    );
    expect(s.licenses.length).toBeGreaterThan(1);
  });
});
