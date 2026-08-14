import { describe, expect, it } from 'vitest';
import { parseGhostty } from '../src/parsers/ghostty.js';
import { parseWarpYaml } from '../src/parsers/warp.js';

/**
 * Reject paths (issue #177).
 *
 * All five parsers had happy-path tests, but only `windowsterminal` and
 * `native` had negative ones. These are the silent-drop branches — the places
 * where a malformed upstream file produces a *wrong theme* rather than a build
 * failure, which is the worst outcome for a dataset package.
 *
 * Every case below pairs the malformed input with a valid sibling slot, so the
 * assertion is "the bad line was ignored AND the good one still landed",
 * rather than just "it threw".
 */

// Minimal ghostty config that satisfies UpstreamSchemeSchema, with the 16
// palette slots present. Callers append their own malformed lines.
function ghosttyBase(extra = ''): string {
  const palette = Array.from(
    { length: 16 },
    (_, i) => `palette = ${i}=#0000${(i + 16).toString(16)}`,
  );
  return [
    'background = #101010',
    'foreground = #f0f0f0',
    'cursor-color = #ff00ff',
    'selection-background = #202020',
    ...palette,
    extra,
  ].join('\n');
}

describe('parseGhostty reject paths', () => {
  it('ignores a palette line with no inner "=" (ghostty.ts:57)', () => {
    const theme = parseGhostty(ghosttyBase('palette = 4'), 'x');
    // Slot 4 keeps the value from the base config, not garbage.
    expect(theme.blue).toBe('#000014');
  });

  it.each([
    ['non-integer index', 'palette = 1.5=#abcdef'],
    ['negative index', 'palette = -1=#abcdef'],
    ['index above 15', 'palette = 16=#abcdef'],
  ])('ignores %s (ghostty.ts:60)', (_label, line) => {
    const theme = parseGhostty(ghosttyBase(line), 'x');
    expect(theme.black).toBe('#000010');
    expect(theme.brightWhite).toBe('#00001f');
  });

  it('ignores a palette line whose value is not hex (ghostty.ts:61)', () => {
    const theme = parseGhostty(ghosttyBase('palette = 1=notacolor'), 'x');
    expect(theme.red).toBe('#000011');
  });

  it('ignores a config line with no "=" at all (ghostty.ts:82)', () => {
    const theme = parseGhostty(ghosttyBase('this-line-has-no-equals-sign'), 'x');
    expect(theme.background).toBe('#101010');
  });

  it('ignores an unknown top-level key', () => {
    const theme = parseGhostty(ghosttyBase('font-family = Fira Code'), 'x');
    expect(theme.background).toBe('#101010');
  });

  it('accepts a bare hex with no leading "#" (ghostty.ts:99 normaliseHex)', () => {
    // The HEX regex admits `ff0000`; normaliseHex is what prefixes it. This
    // branch was never exercised, so a bare-hex upstream file was untested.
    const theme = parseGhostty(ghosttyBase('background = 00ff00'), 'x');
    expect(theme.background).toBe('#00ff00');
  });

  it('falls back to background when selection-background is absent', () => {
    const withoutSelection = ghosttyBase()
      .split('\n')
      .filter((l) => !l.startsWith('selection-background'))
      .join('\n');
    const theme = parseGhostty(withoutSelection, 'x');
    expect(theme.selectionBackground).toBe('#101010');
  });

  it('throws when the result cannot satisfy the schema', () => {
    // A silent drop here would ship a theme missing required slots.
    expect(() => parseGhostty('background = #101010', 'x')).toThrow();
  });
});

function warpYaml(accentLine: string): string {
  return `accent: ${accentLine}
background: "#101010"
foreground: "#f0f0f0"
details: darker
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
}

describe('parseWarpYaml accent fallback (warp.ts:71-72)', () => {
  it('uses foreground as cursorColor when accent is absent', () => {
    // The existing fixture always defines `accent`, so this fallback had
    // never run.
    const withoutAccent = warpYaml('"#00ff00"')
      .split('\n')
      .filter((l) => !l.startsWith('accent:'))
      .join('\n');
    const theme = parseWarpYaml(withoutAccent, 'x');
    expect(theme.cursorColor).toBe('#f0f0f0');
  });

  it('uses foreground as cursorColor when accent is not a hex string', () => {
    const theme = parseWarpYaml(warpYaml('not-a-color'), 'x');
    expect(theme.cursorColor).toBe('#f0f0f0');
  });

  it('uses accent as cursorColor when it is valid hex', () => {
    const theme = parseWarpYaml(warpYaml('"#abcdef"'), 'x');
    expect(theme.cursorColor).toBe('#abcdef');
  });

  it('mirrors background into selectionBackground', () => {
    const theme = parseWarpYaml(warpYaml('"#abcdef"'), 'x');
    expect(theme.selectionBackground).toBe('#101010');
  });
});
