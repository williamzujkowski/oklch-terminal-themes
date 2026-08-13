// Theme assembly: turning one parsed upstream/native scheme into one
// `TerminalColorTheme`, plus the `themes-slim.json` projection.
//
// Extracted from `scripts/build.ts` (issue #175). Everything here is pure —
// no file I/O, no `process.exit` — so the policy it encodes (which ref a
// permalink pins to, when `oklchAuthored` is omitted, what the published
// slim record contains) is reachable from a test with in-memory fixtures.
// Like `src/counterpart.ts` and `src/accent.ts`, this is build tooling and
// is deliberately not re-exported from `src/index.ts`.
import { convertHexToColor, resolveNativeColor } from './convert.js';
import { classifyTheme, type ClassifiableTheme } from './classify.js';
import { toAccentSlim } from './accent.js';
import { toDatavizSlim } from './dataviz.js';
import { toSlug } from './slug.js';
import type { SourceConfig } from './sources.js';
import type { NativeColorInput, NativeScheme, UpstreamScheme } from './schema.js';
import { COLOR_KEYS } from './types.js';
import type { ColorKey, Colors, SlimTheme, TerminalColorTheme } from './types.js';

// Our `ColorKey` names vs. the Windows-Terminal-style key names every
// hex-only upstream scheme uses.
//
// Both scheme schemas are `.loose()`, so their inferred types carry an
// `[k: string]: unknown` index signature and any lookup widens to `unknown`.
// That is why the reads below re-narrow: Zod has already validated the
// declared shape, but the index signature hides that from the compiler.
export const UPSTREAM_KEY_MAP: Record<ColorKey, string> = {
  background: 'background',
  foreground: 'foreground',
  cursor: 'cursorColor',
  selection: 'selectionBackground',
  black: 'black',
  red: 'red',
  green: 'green',
  yellow: 'yellow',
  blue: 'blue',
  purple: 'purple',
  cyan: 'cyan',
  white: 'white',
  brightBlack: 'brightBlack',
  brightRed: 'brightRed',
  brightGreen: 'brightGreen',
  brightYellow: 'brightYellow',
  brightBlue: 'brightBlue',
  brightPurple: 'brightPurple',
  brightCyan: 'brightCyan',
  brightWhite: 'brightWhite',
};

export function nameFromFilename(filename: string): string {
  // Drop the extension. Ghostty themes have no extension; warp/jsonc do.
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export interface AssembleThemeInput {
  name: string;
  colors: Colors;
  oklchAuthored: ColorKey[];
  source: SourceConfig;
  filename: string;
  sha: string;
  updatedAt: string;
}

// Shared theme assembly for both the hex-only (`buildTheme`) and native
// hex-or-OKLCH (`buildNativeTheme`) ingest paths — see issue #132.
// `oklchAuthored` is omitted entirely (not just empty) when no slot was
// OKLCH-authored, matching the `counterpart` optional-field convention.
export function assembleTheme(input: AssembleThemeInput): TerminalColorTheme {
  const { name, colors, oklchAuthored, source, filename, sha, updatedAt } = input;
  const slug = toSlug(name);
  // Local sources have no separate upstream commit, so the permalink uses
  // `main` rather than a 40-hex SHA. Everyone else gets a SHA-pinned URL.
  const ref = source.local === true ? 'main' : sha;
  // `classifyTheme` overwrites `isDark` and `tags` below, but they are seeded
  // here on purpose: `JSON.stringify` emits keys in insertion order, so
  // dropping them from this literal moves them to the end of every record in
  // `data/**` — a 634-file no-op diff on the next nightly sync. Key order in
  // the published artifacts is load-bearing (issue #140/#141). `contrast` is
  // absent because it has always been appended after `colors`, which is where
  // the committed data has it.
  const theme: ClassifiableTheme = {
    name,
    slug,
    isDark: false,
    tags: [],
    source: source.id,
    sourceUrl: `https://github.com/${source.repo}/blob/${ref}/${source.themesPath}/${filename}`,
    upstreamSha: sha,
    updatedAt,
    colors,
    ...(oklchAuthored.length > 0 ? { oklchAuthored } : {}),
  };
  classifyTheme(theme);
  return theme;
}

export function buildTheme(
  parsed: UpstreamScheme,
  source: SourceConfig,
  filename: string,
  sha: string,
  updatedAt: string,
): TerminalColorTheme {
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    colors[key] = convertHexToColor(parsed[UPSTREAM_KEY_MAP[key]] as string);
  }
  return assembleTheme({
    name: parsed.name,
    colors,
    oklchAuthored: [],
    source,
    filename,
    sha,
    updatedAt,
  });
}

// Native sources (data-sources/native/*.json, `nativeAuthoring: true` in
// sources.json) may author each slot as hex OR OKLCH — issue #132.
// `resolveNativeColor` decides per slot; authored slots are tracked in
// `oklchAuthored` so `scripts/validate.ts` can invert its round-trip check.
export function buildNativeTheme(
  parsed: NativeScheme,
  source: SourceConfig,
  filename: string,
  sha: string,
  updatedAt: string,
): TerminalColorTheme {
  const colors = {} as Colors;
  const oklchAuthored: ColorKey[] = [];
  for (const key of COLOR_KEYS) {
    const { color, authored } = resolveNativeColor(
      parsed[UPSTREAM_KEY_MAP[key]] as NativeColorInput,
    );
    colors[key] = color;
    if (authored) oklchAuthored.push(key);
  }
  return assembleTheme({
    name: parsed.name,
    colors,
    oklchAuthored,
    source,
    filename,
    sha,
    updatedAt,
  });
}

// The published `themes-slim.json` record shape. Optional blocks are omitted
// rather than emitted as `undefined` so the artifact stays byte-stable.
export function toSlim(theme: TerminalColorTheme): SlimTheme {
  const slimColors = {} as SlimTheme['colors'];
  for (const key of COLOR_KEYS) {
    slimColors[key] = theme.colors[key].oklchCss;
  }
  return {
    name: theme.name,
    slug: theme.slug,
    isDark: theme.isDark,
    contrast: theme.contrast,
    colors: slimColors,
    ...(theme.counterpart !== undefined ? { counterpart: theme.counterpart } : {}),
    ...(theme.accent !== undefined ? { accent: toAccentSlim(theme.accent) } : {}),
    ...(theme.dataviz !== undefined ? { dataviz: toDatavizSlim(theme.dataviz) } : {}),
  };
}
