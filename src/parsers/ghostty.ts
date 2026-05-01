import { UpstreamSchemeSchema, type UpstreamScheme } from '../schema.js';

// palette index → mbadolato/Windows-Terminal key. 0..15 is the standard ANSI
// 8 + bright 8 layout that ghostty (and every other terminal) uses.
const PALETTE_INDEX_KEY = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'purple',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightPurple',
  'brightCyan',
  'brightWhite',
] as const;

const TOPLEVEL_KEY: Record<
  string,
  keyof Pick<UpstreamScheme, 'background' | 'foreground' | 'cursorColor' | 'selectionBackground'>
> = {
  background: 'background',
  foreground: 'foreground',
  'cursor-color': 'cursorColor',
  'selection-background': 'selectionBackground',
};

const HEX = /^#?[0-9a-fA-F]{6}$/;

/**
 * Parses a ghostty terminal config theme file into the canonical
 * mbadolato/Windows-Terminal-JSON shape. The format is line-oriented:
 *
 *   palette = 0=#1d282f
 *   palette = 1=#ff5b61
 *   ...
 *   background = #1d282f
 *   foreground = #dbd0c6
 *   cursor-color = #dbd0c6
 *   selection-background = #223b49
 *
 * Lines starting with `#` are comments (including the `#:` annotated style).
 * Theme name comes from `nameFromFilename` because the file itself has no
 * name field.
 */
type Palette = Partial<Record<(typeof PALETTE_INDEX_KEY)[number], string>>;
type TopLevel = Partial<Record<keyof UpstreamScheme, string>>;

function applyPaletteLine(palette: Palette, value: string): void {
  const inner = value.indexOf('=');
  if (inner < 0) return;
  const idx = Number(value.slice(0, inner).trim());
  const hex = value.slice(inner + 1).trim();
  if (!Number.isInteger(idx) || idx < 0 || idx > 15) return;
  if (!HEX.test(hex)) return;
  const slot = PALETTE_INDEX_KEY[idx];
  if (slot === undefined) return;
  palette[slot] = normaliseHex(hex);
}

function applyTopLevelLine(top: TopLevel, key: string, value: string): void {
  const mapped = TOPLEVEL_KEY[key];
  if (mapped !== undefined && HEX.test(value)) {
    top[mapped] = normaliseHex(value);
  }
}

export function parseGhostty(content: string, nameFromFilename: string): UpstreamScheme {
  const palette: Palette = {};
  const top: TopLevel = { name: nameFromFilename };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'palette') applyPaletteLine(palette, value);
    else applyTopLevelLine(top, key, value);
  }

  // Ghostty doesn't require selection-background; mbadolato schema does. Fall
  // back to background so the schema stays satisfied.
  if (top.selectionBackground === undefined && top.background !== undefined) {
    top.selectionBackground = top.background;
  }

  return UpstreamSchemeSchema.parse({ ...top, ...palette });
}

function normaliseHex(hex: string): string {
  return hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
}
