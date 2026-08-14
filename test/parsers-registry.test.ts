import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultExtensionFor, parserFor } from '../src/parsers/index.js';
import { SOURCE_FORMATS, SourcesConfigSchema } from '../src/sources.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

const ANSI = {
  black: '#000000',
  red: '#ff0000',
  green: '#00ff00',
  yellow: '#ffff00',
  blue: '#0000ff',
  purple: '#ff00ff',
  cyan: '#00ffff',
  white: '#ffffff',
  brightBlack: '#111111',
  brightRed: '#ff1111',
  brightGreen: '#11ff11',
  brightYellow: '#ffff11',
  brightBlue: '#1111ff',
  brightPurple: '#ff11ff',
  brightCyan: '#11ffff',
  brightWhite: '#eeeeee',
};

const WT_SCHEME = {
  name: 'Embedded Name',
  background: '#101010',
  foreground: '#f0f0f0',
  cursorColor: '#ff00ff',
  selectionBackground: '#202020',
  ...ANSI,
};

const GHOSTTY_CONFIG = [
  'background = #101010',
  'foreground = #f0f0f0',
  'cursor-color = #ff00ff',
  'selection-background = #202020',
  ...Object.values(ANSI).map((hex, i) => `palette = ${i}=${hex}`),
].join('\n');

const WARP_YAML = `accent: "#ff00ff"
background: "#101010"
foreground: "#f0f0f0"
terminal_colors:
  normal:
    black: "#000000"
    red: "#ff0000"
    green: "#00ff00"
    yellow: "#ffff00"
    blue: "#0000ff"
    magenta: "#ff00ff"
    cyan: "#00ffff"
    white: "#ffffff"
  bright:
    black: "#111111"
    red: "#ff1111"
    green: "#11ff11"
    yellow: "#ffff11"
    blue: "#1111ff"
    magenta: "#ff11ff"
    cyan: "#11ffff"
    white: "#eeeeee"
`;

/**
 * The registry (issue #176).
 *
 * `test/parsers.test.ts` imports all four parsers directly and bypasses this
 * module entirely, so `parserFor` / `defaultExtensionFor` sat at 0% coverage.
 * The failure mode that leaves open is silent: adding a value to
 * `SOURCE_FORMATS` without a matching `PARSERS` / `FORMAT_EXTENSIONS` entry
 * yields `undefined` at build time with nothing failing here.
 *
 * Driving both lookups off `SOURCE_FORMATS` itself is what makes this a
 * permanent guard rather than a snapshot — a new format is covered the moment
 * it is added to the list.
 */
describe('parser registry', () => {
  it.each([...SOURCE_FORMATS])('parserFor(%s) returns a callable parser', (format) => {
    const parser = parserFor(format);
    expect(typeof parser).toBe('function');
    // Arity is (content, nameFromFilename) — a parser wired with the wrong
    // shape would still be a function, so check it accepts both.
    expect(parser.length).toBeLessThanOrEqual(2);
  });

  it.each([...SOURCE_FORMATS])('defaultExtensionFor(%s) returns a defined string', (format) => {
    const ext = defaultExtensionFor(format);
    expect(typeof ext).toBe('string');
    // ghostty is deliberately extension-less; everything else is dot-prefixed.
    if (ext !== '') expect(ext.startsWith('.')).toBe(true);
  });

  it('covers every declared format — no SOURCE_FORMATS entry is unmapped', () => {
    for (const format of SOURCE_FORMATS) {
      expect(parserFor(format), `no parser for "${format}"`).toBeDefined();
      expect(defaultExtensionFor(format), `no extension for "${format}"`).toBeDefined();
    }
  });

  /**
   * Actually dispatching through the registry, not just checking a function
   * comes back. The wiring in `PARSERS` is a set of adapter arrows — one per
   * format, each deciding whether its parser needs the filename fallback —
   * and only invoking them proves each is bound to the right parser with the
   * right arity. `parserFor(f) === someFunction` would pass even if two
   * formats were swapped.
   */
  const MINIMAL: Record<(typeof SOURCE_FORMATS)[number], string> = {
    'windowsterminal-json': JSON.stringify(WT_SCHEME),
    'windowsterminal-jsonc': `// a comment\n${JSON.stringify(WT_SCHEME)}`,
    ghostty: GHOSTTY_CONFIG,
    'warp-yaml': WARP_YAML,
  };

  it.each([...SOURCE_FORMATS])('dispatching %s through the registry parses', (format) => {
    const parsed = parserFor(format)(MINIMAL[format], 'From Filename');
    expect(parsed.background).toBe('#101010');
    expect(parsed.foreground).toBe('#f0f0f0');
    expect(parsed.red).toBeDefined();
  });

  it('formats that derive the name from the filename actually receive it', () => {
    // ghostty and warp-yaml take `nameFromFilename`; the JSON formats carry
    // their own `name`. A registry arrow that dropped the second argument
    // would silently name every theme after its file.
    expect(parserFor('ghostty')(GHOSTTY_CONFIG, 'From Filename').name).toBe('From Filename');
    expect(parserFor('warp-yaml')(WARP_YAML, 'From Filename').name).toBe('From Filename');
    expect(parserFor('windowsterminal-json')(JSON.stringify(WT_SCHEME), 'Ignored').name).toBe(
      'Embedded Name',
    );
  });
});

/**
 * The sources schema (issue #176). `grep` for `SourcesConfigSchema` across
 * `test/` previously returned zero hits, so the duplicate-id `superRefine` —
 * the guard protecting slug-collision priority ordering — had never executed.
 */
describe('SourcesConfigSchema', () => {
  const valid = {
    id: 'example',
    name: 'Example',
    repo: 'owner/name',
    url: 'https://github.com/owner/name',
    themesPath: 'themes',
    license: 'MIT',
    format: 'ghostty' as const,
  };

  it('accepts a well-formed config', () => {
    expect(SourcesConfigSchema.safeParse([valid]).success).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(SourcesConfigSchema.safeParse([]).success).toBe(false);
  });

  it('rejects duplicate source ids', () => {
    const result = SourcesConfigSchema.safeParse([valid, { ...valid, repo: 'other/name' }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate source id'))).toBe(true);
    }
  });

  it("the repo's own sources.json validates", () => {
    // Previously only checked implicitly at build time, so a bad edit failed
    // the build rather than the test suite.
    const raw = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')) as unknown;
    const result = SourcesConfigSchema.safeParse(raw);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('every source in sources.json maps to a registered parser', () => {
    // Ties the two halves together: a format in sources.json with no parser
    // is the exact build-time `undefined` this file exists to prevent.
    const raw = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')) as {
      id: string;
      format?: string;
    }[];
    for (const source of raw) {
      const format = (source.format ?? 'windowsterminal-json') as (typeof SOURCE_FORMATS)[number];
      expect(SOURCE_FORMATS, `${source.id} declares unknown format "${format}"`).toContain(format);
      expect(typeof parserFor(format), `${source.id} has no parser`).toBe('function');
    }
  });
});
