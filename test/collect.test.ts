import { describe, expect, it } from 'vitest';
import {
  collectFromSource,
  matchesSourceExtension,
  parsePreviousIndex,
  parsePreviousThemes,
  selectSourceFiles,
  sourceFormat,
  type CollectedTheme,
  type SourceReader,
} from '../src/collect.js';
import type { SourceConfig } from '../src/sources.js';

const SHA = '97e244cf98a0eb2ce4339d2069ec1bba6c81f141';
const AT = '2026-01-01T00:00:00.000Z';

function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'iterm2-color-schemes',
    name: 'iTerm2 Color Schemes',
    repo: 'mbadolato/iTerm2-Color-Schemes',
    url: 'https://github.com/mbadolato/iTerm2-Color-Schemes',
    themesPath: 'windowsterminal',
    license: 'MIT',
    ...overrides,
  };
}

const HEXES = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursorColor: '#c0caf5',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  purple: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightPurple: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

function schemeJson(name: string): string {
  return JSON.stringify({ name, ...HEXES });
}

/** In-memory `SourceReader` over a `{ filename: contents }` map. */
function reader(files: Record<string, string>): SourceReader {
  return {
    list: () => Object.keys(files),
    read: (_source, file) => {
      const content = files[file];
      if (content === undefined) throw new Error(`no such file: ${file}`);
      return content;
    },
  };
}

describe('sourceFormat', () => {
  it('defaults to windowsterminal-json for back-compat', () => {
    expect(sourceFormat(makeSource())).toBe('windowsterminal-json');
  });

  it('honours an explicit format', () => {
    expect(sourceFormat(makeSource({ format: 'ghostty' }))).toBe('ghostty');
  });
});

describe('matchesSourceExtension', () => {
  it('matches by suffix when an extension is configured', () => {
    expect(matchesSourceExtension('Dracula.json', '.json')).toBe(true);
    expect(matchesSourceExtension('Dracula.yaml', '.json')).toBe(false);
  });

  it('treats the empty extension as "no dot anywhere" for ghostty', () => {
    // Ghostty config files conventionally have no extension at all, so the
    // rule inverts: presence of a dot disqualifies. This is what keeps
    // README.md and LICENSE out of the theme list.
    expect(matchesSourceExtension('Tokyo Night', '')).toBe(true);
    expect(matchesSourceExtension('README.md', '')).toBe(false);
    expect(matchesSourceExtension('.gitignore', '')).toBe(false);
  });
});

describe('selectSourceFiles', () => {
  const names = ['b.json', 'a.json', 'README.md', 'notes.txt'];

  it('keeps only the format extension and sorts deterministically', () => {
    expect(selectSourceFiles(names, makeSource())).toEqual(['a.json', 'b.json']);
  });

  it('applies excludeFiles after extension filtering', () => {
    expect(selectSourceFiles(names, makeSource({ excludeFiles: ['a.json'] }))).toEqual(['b.json']);
  });

  it('lets a source override the format default extension', () => {
    expect(selectSourceFiles(names, makeSource({ fileExtension: '.txt' }))).toEqual(['notes.txt']);
  });

  it('selects extension-less files for ghostty sources', () => {
    const ghostty = makeSource({ format: 'ghostty' });
    expect(selectSourceFiles(['Tokyo Night', 'README.md', 'Dracula'], ghostty)).toEqual([
      'Dracula',
      'Tokyo Night',
    ]);
  });

  it('does not mutate the caller-supplied listing', () => {
    // The real caller passes `readdirSync` output straight through; an
    // in-place sort would be a surprise if that array is reused.
    const input = ['b.json', 'a.json'];
    selectSourceFiles(input, makeSource());
    expect(input).toEqual(['b.json', 'a.json']);
  });
});

describe('collectFromSource slug-collision policy', () => {
  it('collects one theme per file', () => {
    const seen = new Map<string, CollectedTheme>();
    const result = collectFromSource(
      makeSource(),
      SHA,
      AT,
      seen,
      reader({ 'A.json': schemeJson('Dracula'), 'B.json': schemeJson('Nord') }),
    );
    expect(result.themes.map((t) => t.slug)).toEqual(['dracula', 'nord']);
    expect(result.failures).toEqual([]);
    expect(result.droppedDuplicates).toEqual([]);
  });

  it('FAILS on a duplicate slug within one source', () => {
    // Two files in the same source claiming one slug means the source is
    // internally inconsistent: whichever loses would vanish from the corpus
    // with no way for a maintainer to notice. That is a build failure.
    const seen = new Map<string, CollectedTheme>();
    const result = collectFromSource(
      makeSource(),
      SHA,
      AT,
      seen,
      // Same name via different filenames -> same slug.
      reader({ 'Dracula.json': schemeJson('Dracula'), 'dracula.json': schemeJson('Dracula') }),
    );
    expect(result.themes).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toContain('Duplicate slug "dracula"');
    expect(result.failures[0]?.error).toContain('iterm2-color-schemes');
    expect(result.droppedDuplicates).toEqual([]);
  });

  it('DROPS a cross-source duplicate, first source wins', () => {
    // Sources legitimately overlap — many ship a "Dracula" — so priority
    // order in sources.json is the intended resolution, not an error.
    const seen = new Map<string, CollectedTheme>();
    const first = collectFromSource(
      makeSource({ id: 'iterm2-color-schemes' }),
      SHA,
      AT,
      seen,
      reader({ 'Dracula.json': schemeJson('Dracula') }),
    );
    const second = collectFromSource(
      makeSource({ id: 'thorn' }),
      SHA,
      AT,
      seen,
      reader({ 'Dracula.json': schemeJson('Dracula') }),
    );

    expect(first.themes).toHaveLength(1);
    expect(second.themes).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(second.droppedDuplicates).toHaveLength(1);
    expect(second.droppedDuplicates[0]).toContain('[thorn]');
    expect(second.droppedDuplicates[0]).toContain('already provided by [iterm2-color-schemes]');
    // The winner is the one the earlier source contributed.
    expect(seen.get('dracula')?.source).toBe('iterm2-color-schemes');
  });

  it('reverses the winner when source order reverses', () => {
    // Pins that the outcome is decided by sources.json order alone and not by
    // anything intrinsic to the sources themselves.
    const seen = new Map<string, CollectedTheme>();
    collectFromSource(
      makeSource({ id: 'thorn' }),
      SHA,
      AT,
      seen,
      reader({ 'Dracula.json': schemeJson('Dracula') }),
    );
    const second = collectFromSource(
      makeSource({ id: 'iterm2-color-schemes' }),
      SHA,
      AT,
      seen,
      reader({ 'Dracula.json': schemeJson('Dracula') }),
    );
    expect(second.themes).toEqual([]);
    expect(seen.get('dracula')?.source).toBe('thorn');
  });

  it('records a parse failure per file without aborting the rest', () => {
    const seen = new Map<string, CollectedTheme>();
    const result = collectFromSource(
      makeSource(),
      SHA,
      AT,
      seen,
      reader({ 'Bad.json': '{ not json', 'Good.json': schemeJson('Nord') }),
    );
    expect(result.themes.map((t) => t.slug)).toEqual(['nord']);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.file).toBe('Bad.json');
  });

  it('rejects a scheme missing a required colour rather than emitting a hole', () => {
    const missingCyan: Record<string, string> = { name: 'Broken', ...HEXES };
    delete missingCyan.cyan;
    const seen = new Map<string, CollectedTheme>();
    const result = collectFromSource(
      makeSource(),
      SHA,
      AT,
      seen,
      reader({ 'Broken.json': JSON.stringify(missingCyan) }),
    );
    expect(result.themes).toEqual([]);
    expect(result.failures).toHaveLength(1);
  });
});

describe('parsePreviousThemes', () => {
  it('keys readable records by their slug', () => {
    const { bySlug, unreadable } = parsePreviousThemes([
      { file: 'a.json', content: JSON.stringify({ slug: 'dracula', name: 'Dracula' }) },
      { file: 'b.json', content: JSON.stringify({ slug: 'nord', name: 'Nord' }) },
    ]);
    expect([...bySlug.keys()]).toEqual(['dracula', 'nord']);
    expect(unreadable).toEqual([]);
  });

  it('reports corrupt JSON instead of swallowing it', () => {
    // The old `catch {}` made this invisible. Every unreadable record
    // re-stamps its theme's `updatedAt`, so a silent failure here surfaces
    // only as an inexplicably large nightly sync diff (issue #140).
    const { bySlug, unreadable } = parsePreviousThemes([
      { file: 'ok.json', content: JSON.stringify({ slug: 'nord' }) },
      { file: 'truncated.json', content: '{"slug": "dra' },
    ]);
    expect([...bySlug.keys()]).toEqual(['nord']);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]?.file).toBe('truncated.json');
    expect(unreadable[0]?.reason).toBeTruthy();
  });

  it('rejects valid JSON that is not a theme record', () => {
    // Previously `bySlug.set(parsed.slug, ...)` with an undefined slug keyed
    // the map under `undefined`, so one stray JSON file could sit in the map
    // and shadow lookups.
    const { bySlug, unreadable } = parsePreviousThemes([
      { file: 'meta.json', content: '{"generatedAt":"2026-01-01T00:00:00.000Z"}' },
      { file: 'null.json', content: 'null' },
      { file: 'array.json', content: '[]' },
    ]);
    expect(bySlug.size).toBe(0);
    expect(bySlug.has(undefined as unknown as string)).toBe(false);
    expect(unreadable.map((u) => u.file)).toEqual(['meta.json', 'null.json', 'array.json']);
    for (const u of unreadable) expect(u.reason).toBe('no string "slug" field');
  });

  it('returns an empty result for no input, the first-build case', () => {
    const { bySlug, unreadable } = parsePreviousThemes([]);
    expect(bySlug.size).toBe(0);
    expect(unreadable).toEqual([]);
  });
});

describe('parsePreviousIndex', () => {
  it('parses a previous index', () => {
    expect(parsePreviousIndex('{"count":633}')).toEqual({ count: 633 });
  });

  it('degrades to undefined on corrupt content or a first build', () => {
    expect(parsePreviousIndex('{ truncated')).toBeUndefined();
    expect(parsePreviousIndex(undefined)).toBeUndefined();
  });
});
