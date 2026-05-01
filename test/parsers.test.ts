import { describe, expect, it } from 'vitest';
import { parseWindowsTerminalJson } from '../src/parsers/windowsterminal.js';
import { parseWindowsTerminalJsonc } from '../src/parsers/jsonc.js';
import { parseGhostty } from '../src/parsers/ghostty.js';
import { parseWarpYaml } from '../src/parsers/warp.js';

const FULL_WT_BODY = `{
  "name": "Test",
  "background": "#000000",
  "foreground": "#ffffff",
  "cursorColor": "#aaaaaa",
  "selectionBackground": "#222222",
  "black": "#000000",
  "red": "#ff0000",
  "green": "#00ff00",
  "yellow": "#ffff00",
  "blue": "#0000ff",
  "purple": "#ff00ff",
  "cyan": "#00ffff",
  "white": "#ffffff",
  "brightBlack": "#444444",
  "brightRed": "#ff4444",
  "brightGreen": "#44ff44",
  "brightYellow": "#ffff44",
  "brightBlue": "#4444ff",
  "brightPurple": "#ff44ff",
  "brightCyan": "#44ffff",
  "brightWhite": "#ffffff"
}`;

describe('parseWindowsTerminalJson', () => {
  it('parses a well-formed mbadolato-shape file', () => {
    const r = parseWindowsTerminalJson(FULL_WT_BODY);
    expect(r.name).toBe('Test');
    expect(r.background).toBe('#000000');
    expect(r.purple).toBe('#ff00ff');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseWindowsTerminalJson('{ "name": "Bad", missing-close')).toThrow();
  });

  it('throws on missing required keys', () => {
    expect(() => parseWindowsTerminalJson('{ "name": "Bad" }')).toThrow();
  });
});

describe('parseWindowsTerminalJsonc', () => {
  it('strips line + block comments and trailing commas', () => {
    const jsonc = `// header comment\n/* block\ncomment */\n${FULL_WT_BODY.replace(/}$/, ',\n}')}`;
    const r = parseWindowsTerminalJsonc(jsonc);
    expect(r.name).toBe('Test');
    expect(r.background).toBe('#000000');
  });

  it('handles real kanagawa-paper-style header comments', () => {
    const jsonc = [
      '// -----------------------------------------------------------------------------',
      '// Kanagawa Paper Ink',
      '// Upstream: https://example.com',
      '// -----------------------------------------------------------------------------',
      FULL_WT_BODY,
    ].join('\n');
    const r = parseWindowsTerminalJsonc(jsonc);
    expect(r.name).toBe('Test');
  });
});

describe('parseGhostty', () => {
  // Ghostty config files don't carry a name; the filename supplies it.
  const sample = [
    '# header comment',
    'palette = 0=#1d282f',
    'palette = 1=#ff5b61',
    'palette = 2=#9dc6a9',
    'palette = 3=#ffcf99',
    'palette = 4=#86bfd2',
    'palette = 5=#d59cce',
    'palette = 6=#79c2b6',
    'palette = 7=#91a4ad',
    'palette = 8=#568270',
    'palette = 9=#d48588',
    'palette = 10=#95c2a1',
    'palette = 11=#fdd9af',
    'palette = 12=#a7cbea',
    'palette = 13=#d9add4',
    'palette = 14=#87cbb1',
    'palette = 15=#dbd0c6',
    'background = #1d282f',
    'foreground = #dbd0c6',
    'cursor-color = #dbd0c6',
    'selection-background = #223b49',
  ].join('\n');

  it('maps palette indices to ANSI + bright slots correctly', () => {
    const r = parseGhostty(sample, 'Thorn Dark Cold');
    expect(r.name).toBe('Thorn Dark Cold');
    expect(r.black).toBe('#1d282f');
    expect(r.red).toBe('#ff5b61');
    expect(r.purple).toBe('#d59cce'); // palette index 5 → purple
    expect(r.brightBlack).toBe('#568270');
    expect(r.brightWhite).toBe('#dbd0c6');
  });

  it('maps top-level keys (background, foreground, cursor-color, selection-background)', () => {
    const r = parseGhostty(sample, 'Thorn Dark Cold');
    expect(r.background).toBe('#1d282f');
    expect(r.foreground).toBe('#dbd0c6');
    expect(r.cursorColor).toBe('#dbd0c6');
    expect(r.selectionBackground).toBe('#223b49');
  });

  it('falls back to background when selection-background is omitted', () => {
    const noSelection = sample.replace(/\n?selection-background = #223b49/, '');
    const r = parseGhostty(noSelection, 'X');
    expect(r.selectionBackground).toBe(r.background);
  });

  it('skips comment lines (#: annotated style)', () => {
    const annotated = sample.replace('# header comment', '#: black\n#: not a value');
    expect(() => parseGhostty(annotated, 'X')).not.toThrow();
  });
});

describe('parseWarpYaml', () => {
  const sample = `accent: '#bd93f9'
background: '#282a36'
details: darker
foreground: '#f8f8f2'
terminal_colors:
  normal:
    black: '#000000'
    red: '#ff5555'
    green: '#50fa7b'
    yellow: '#f1fa8c'
    blue: '#bd93f9'
    magenta: '#ff79c6'
    cyan: '#8be9fd'
    white: '#bbbbbb'
  bright:
    black: '#555555'
    red: '#ff5555'
    green: '#50fa7b'
    yellow: '#f1fa8c'
    blue: '#caa9fa'
    magenta: '#ff79c6'
    cyan: '#8be9fd'
    white: '#ffffff'
`;

  it('maps top-level + terminal_colors.normal/bright into mbadolato keys (magenta → purple)', () => {
    const r = parseWarpYaml(sample, 'sample');
    expect(r.name).toBe('sample');
    expect(r.background).toBe('#282a36');
    expect(r.foreground).toBe('#f8f8f2');
    expect(r.cursorColor).toBe('#bd93f9'); // accent → cursor
    expect(r.purple).toBe('#ff79c6'); // magenta → purple
    expect(r.brightPurple).toBe('#ff79c6');
  });

  it('handles single- and double-quoted hex values', () => {
    const dq = sample.replaceAll("'#", '"#').replaceAll("'\n", '"\n');
    const r = parseWarpYaml(dq, 'sample');
    expect(r.background).toBe('#282a36');
  });

  it('ignores nested non-color blocks (e.g. background_image)', () => {
    const withImage = `accent: '#bd93f9'
background: '#282a36'
foreground: '#f8f8f2'
background_image:
  # photo credit: example
  path: special_edition/wallpaper.jpg
  opacity: 30
${sample.split('terminal_colors:')[1] !== undefined ? 'terminal_colors:' + sample.split('terminal_colors:')[1] : ''}`;
    const r = parseWarpYaml(withImage, 'sample');
    expect(r.background).toBe('#282a36');
    expect(r.purple).toBeDefined();
  });
});
