import { describe, expect, it } from 'vitest';
import {
  assembleTheme,
  buildNativeTheme,
  buildTheme,
  nameFromFilename,
  toSlim,
} from '../src/assemble.js';
import type { SourceConfig } from '../src/sources.js';
import type { Colors, TerminalColorTheme } from '../src/types.js';
import { COLOR_KEYS } from '../src/types.js';
import { convertHexToColor } from '../src/convert.js';

const SHA = '97e244cf98a0eb2ce4339d2069ec1bba6c81f141';

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

// A dark, plausible palette — real enough that `classifyTheme` produces
// meaningful tags rather than degenerate ones.
const HEXES: Record<string, string> = {
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

function upstreamScheme(name = 'Tokyo Night'): Record<string, string> {
  return { name, ...HEXES };
}

function makeColors(): Colors {
  const colors = {} as Colors;
  const map: Record<string, string> = {
    background: 'background',
    foreground: 'foreground',
    cursor: 'cursorColor',
    selection: 'selectionBackground',
  };
  for (const key of COLOR_KEYS) {
    colors[key] = convertHexToColor(HEXES[map[key] ?? key] as string);
  }
  return colors;
}

describe('nameFromFilename', () => {
  it('drops a trailing extension', () => {
    expect(nameFromFilename('Tokyo Night.json')).toBe('Tokyo Night');
    expect(nameFromFilename('theme.yaml')).toBe('theme');
  });

  it('leaves extension-less ghostty filenames alone', () => {
    expect(nameFromFilename('Tokyo Night')).toBe('Tokyo Night');
  });

  it('keeps a leading dot, which is not an extension separator', () => {
    // `lastIndexOf('.') > 0` — a dotfile has its dot at index 0, so the whole
    // name survives rather than collapsing to the empty string.
    expect(nameFromFilename('.hidden')).toBe('.hidden');
  });

  it('splits on the LAST dot, so dotted theme names keep their prefix', () => {
    expect(nameFromFilename('Solarized v2.1.json')).toBe('Solarized v2.1');
  });
});

describe('assembleTheme sourceUrl ref', () => {
  const base = {
    name: 'Tokyo Night',
    colors: makeColors(),
    oklchAuthored: [],
    filename: 'Tokyo Night.json',
    sha: SHA,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('SHA-pins the permalink for a fetched upstream source', () => {
    const theme = assembleTheme({ ...base, source: makeSource() });
    expect(theme.sourceUrl).toBe(
      `https://github.com/mbadolato/iTerm2-Color-Schemes/blob/${SHA}/windowsterminal/Tokyo Night.json`,
    );
  });

  it('uses `main` for a local source, which has no upstream commit', () => {
    // Local sources carry the literal SHA "local", which is not a valid git
    // ref — a permalink built from it would 404 for every curated theme.
    const theme = assembleTheme({
      ...base,
      sha: 'local',
      source: makeSource({ id: 'native', themesPath: 'data-sources/native', local: true }),
    });
    expect(theme.sourceUrl).toContain('/blob/main/');
    expect(theme.sourceUrl).not.toContain('local');
  });

  it('still records the raw sha in upstreamSha regardless of the ref used', () => {
    const theme = assembleTheme({
      ...base,
      sha: 'local',
      source: makeSource({ local: true }),
    });
    expect(theme.upstreamSha).toBe('local');
  });

  it('treats `local: false` as remote, not local', () => {
    const theme = assembleTheme({ ...base, source: makeSource({ local: false }) });
    expect(theme.sourceUrl).toContain(`/blob/${SHA}/`);
  });
});

describe('assembleTheme oklchAuthored', () => {
  const base = {
    name: 'Tokyo Night',
    colors: makeColors(),
    source: makeSource(),
    filename: 'Tokyo Night.json',
    sha: SHA,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('omits the key entirely when nothing was OKLCH-authored', () => {
    // Omitted, not `[]` — an empty array would appear in every one of the 600+
    // hex-only records in `data/**` for no information gain.
    const theme = assembleTheme({ ...base, oklchAuthored: [] });
    expect('oklchAuthored' in theme).toBe(false);
  });

  it('includes it when at least one slot was authored', () => {
    const theme = assembleTheme({ ...base, oklchAuthored: ['background', 'cyan'] });
    expect(theme.oklchAuthored).toEqual(['background', 'cyan']);
  });
});

describe('assembleTheme key order (artifact byte-stability)', () => {
  it('emits keys in the order the committed data/** records use', () => {
    // `JSON.stringify` follows insertion order, so this ordering IS the file
    // format. Reordering the object literal silently rewrites all 633 records
    // and turns the next nightly sync into an all-noise 634-file diff.
    const theme = assembleTheme({
      name: 'Tokyo Night',
      colors: makeColors(),
      oklchAuthored: [],
      source: makeSource(),
      filename: 'Tokyo Night.json',
      sha: SHA,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(Object.keys(theme).slice(0, 10)).toEqual([
      'name',
      'slug',
      'isDark',
      'tags',
      'source',
      'sourceUrl',
      'upstreamSha',
      'updatedAt',
      'colors',
      'contrast',
    ]);
  });
});

describe('buildTheme / buildNativeTheme', () => {
  const args = ['Tokyo Night.json', SHA, '2026-01-01T00:00:00.000Z'] as const;

  it('maps the Windows-Terminal key names onto our slot names', () => {
    // `cursorColor` -> `cursor` and `selectionBackground` -> `selection` are
    // the two that differ; a silent mismatch here would swap real colours.
    const theme = buildTheme(upstreamScheme() as never, makeSource(), args[0], args[1], args[2]);
    expect(theme.colors.cursor.hex).toBe('#c0caf5');
    expect(theme.colors.selection.hex).toBe('#33467c');
    expect(theme.colors.brightBlack.hex).toBe('#414868');
  });

  it('derives the slug from the scheme name, not the filename', () => {
    const theme = buildTheme(
      upstreamScheme('Tokyo Night') as never,
      makeSource(),
      'completely-different.json',
      args[1],
      args[2],
    );
    expect(theme.slug).toBe('tokyo-night');
  });

  it('marks only the OKLCH-authored slots on the native path', () => {
    const native = { ...upstreamScheme('Native Theme'), background: 'oklch(0.2 0.03 265)' };
    const theme = buildNativeTheme(native as never, makeSource({ id: 'native' }), ...args);
    expect(theme.oklchAuthored).toEqual(['background']);
    expect(theme.colors.red.hex).toBe('#f7768e');
  });

  it('omits oklchAuthored when a native file happens to be all hex', () => {
    const theme = buildNativeTheme(
      upstreamScheme('All Hex') as never,
      makeSource({ id: 'native' }),
      ...args,
    );
    expect('oklchAuthored' in theme).toBe(false);
  });
});

describe('toSlim', () => {
  function fullTheme(): TerminalColorTheme {
    return buildTheme(
      upstreamScheme() as never,
      makeSource(),
      'Tokyo Night.json',
      SHA,
      '2026-01-01T00:00:00.000Z',
    );
  }

  it('reduces every colour to its oklchCss string', () => {
    const slim = toSlim(fullTheme());
    expect(Object.keys(slim.colors)).toEqual([...COLOR_KEYS]);
    expect(slim.colors.background).toMatch(/^oklch\(/);
  });

  it('drops the fields the slim artifact deliberately does not publish', () => {
    // themes-slim.json is the size-sensitive artifact: source provenance,
    // per-colour hex/oklch objects, and tags all live in themes.json only.
    // `SlimTheme` has no index signature, so the double cast is required to
    // ask "is this key absent?" — going straight to Record is a TS2352.
    const slim = toSlim(fullTheme()) as unknown as Record<string, unknown>;
    for (const dropped of ['source', 'sourceUrl', 'upstreamSha', 'updatedAt', 'tags']) {
      expect(dropped in slim).toBe(false);
    }
  });

  it('omits counterpart/accent/dataviz rather than emitting undefined', () => {
    const slim = toSlim(fullTheme()) as unknown as Record<string, unknown>;
    expect('counterpart' in slim).toBe(false);
    expect('accent' in slim).toBe(false);
    expect('dataviz' in slim).toBe(false);
  });

  it('carries counterpart through when present', () => {
    const theme = { ...fullTheme(), counterpart: 'tokyo-night-day' };
    expect(toSlim(theme).counterpart).toBe('tokyo-night-day');
  });
});
