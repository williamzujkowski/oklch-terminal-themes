import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ThemeNameSchema } from '../src/schema.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('ThemeNameSchema', () => {
  it('accepts ordinary theme names', () => {
    for (const name of [
      'Dracula',
      'Solarized Dark',
      'Gruvbox Dark (Hard)',
      'Tokyo Night',
      'atlas_ragnarok',
      'Builtin Pastel Dark',
      'C64',
      'Ubuntu 22.04',
      'N0tch2k',
      'Argonaut+',
      'idle.toes',
    ]) {
      expect(ThemeNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it('accepts non-Latin scripts and combining marks', () => {
    // The constraint is about sink-dangerous characters, not about script.
    // Rejecting a legitimate non-English name would be worse than the hole.
    for (const name of ['东京夜', 'Café Noir', 'Ωmega', 'Тёмная тема', 'הכהה']) {
      expect(ThemeNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  describe('rejects characters that carry meaning in a downstream sink', () => {
    it('rejects HTML angle brackets — the set:html sink in site/src/pages/index.astro', () => {
      const payload = 'x</script><img src=x onerror=alert(1)>';
      expect(ThemeNameSchema.safeParse(payload).success).toBe(false);
      expect(ThemeNameSchema.safeParse('a<b').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a>b').success).toBe(false);
    });

    it('rejects the CSS comment terminator — the src/css-export.ts header sink', () => {
      const payload = 'x */ body{background:url(https://evil/?c=)} /*';
      expect(ThemeNameSchema.safeParse(payload).success).toBe(false);
      // The `*` alone is enough; no need for the full break-out to be present.
      expect(ThemeNameSchema.safeParse('a*b').success).toBe(false);
    });

    it('rejects YAML scalar breakers — the src/schemes.ts sink', () => {
      expect(ThemeNameSchema.safeParse('a"b').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a\\b').success).toBe(false);
    });

    it('rejects newlines and control characters', () => {
      expect(ThemeNameSchema.safeParse('a\nb').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a\rb').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a\tb').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a\u0000b').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a\u001fb').success).toBe(false);
      expect(ThemeNameSchema.safeParse('a\u007fb').success).toBe(false);
    });
  });

  it('rejects empty and over-long names', () => {
    expect(ThemeNameSchema.safeParse('').success).toBe(false);
    expect(ThemeNameSchema.safeParse('a'.repeat(120)).success).toBe(true);
    expect(ThemeNameSchema.safeParse('a'.repeat(121)).success).toBe(false);
  });

  it('accepts every name in the real corpus', () => {
    // The guard that keeps this constraint honest: if a future upstream sync
    // brings in a name this rejects, the corpus is the thing that should
    // decide whether to widen the charset — not a guess at review time.
    const index = JSON.parse(readFileSync(`${ROOT}data/index.json`, 'utf8')) as {
      themes: { name: string; slug: string }[];
    };
    expect(index.themes.length).toBeGreaterThan(0);

    const rejected = index.themes.filter((t) => !ThemeNameSchema.safeParse(t.name).success);
    expect(rejected.map((t) => `${t.slug}: ${t.name}`)).toEqual([]);
  });
});
