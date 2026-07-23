#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertHexToColor, resolveNativeColor } from '../src/convert.js';
import { classifyTheme } from '../src/classify.js';
import { computeAccent, toAccentSlim } from '../src/accent.js';
import { computeCounterparts } from '../src/counterpart.js';
import { toSlug } from '../src/slug.js';
import { SourcesConfigSchema, type SourceConfig, type SourceFormat } from '../src/sources.js';
import { defaultExtensionFor, parserFor } from '../src/parsers/index.js';
import { parseNativeJson } from '../src/parsers/native.js';
import type { NativeColorInput, NativeScheme, UpstreamScheme } from '../src/schema.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorKey, Colors, SlimTheme, TerminalColorTheme, ThemeIndex } from '../src/types.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const UPSTREAM_DIR = join(ROOT, 'upstream');
const DATA_DIR = join(ROOT, 'data');
const BY_NAME_DIR = join(DATA_DIR, 'by-name');
const SOURCES_FILE = join(ROOT, 'sources.json');
const SHAS_FILE = join(ROOT, '.upstream-shas.json');

const UPSTREAM_KEY_MAP: Record<ColorKey, string> = {
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

function loadSources(): SourceConfig[] {
  const raw = JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) as unknown;
  return SourcesConfigSchema.parse(raw);
}

function loadShas(): Record<string, string> {
  if (!existsSync(SHAS_FILE)) {
    console.error(`Missing ${SHAS_FILE}. Run: pnpm tsx scripts/fetch-upstream.ts`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(SHAS_FILE, 'utf8')) as Record<string, string>;
}

function sourceFormat(source: SourceConfig): SourceFormat {
  return source.format ?? 'windowsterminal-json';
}

function nameFromFilename(filename: string): string {
  // Drop the extension. Ghostty themes have no extension; warp/jsonc do.
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

interface AssembleThemeInput {
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
function assembleTheme(input: AssembleThemeInput): TerminalColorTheme {
  const { name, colors, oklchAuthored, source, filename, sha, updatedAt } = input;
  const slug = toSlug(name);
  // Local sources have no separate upstream commit, so the permalink uses
  // `main` rather than a 40-hex SHA. Everyone else gets a SHA-pinned URL.
  const ref = source.local === true ? 'main' : sha;
  const theme: TerminalColorTheme = {
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

function buildTheme(
  parsed: UpstreamScheme,
  source: SourceConfig,
  filename: string,
  sha: string,
  updatedAt: string,
): TerminalColorTheme {
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    const upstreamKey = UPSTREAM_KEY_MAP[key];
    const hex = parsed[upstreamKey as keyof typeof parsed] as string;
    colors[key] = convertHexToColor(hex);
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
function buildNativeTheme(
  parsed: NativeScheme,
  source: SourceConfig,
  filename: string,
  sha: string,
  updatedAt: string,
): TerminalColorTheme {
  const colors = {} as Colors;
  const oklchAuthored: ColorKey[] = [];
  for (const key of COLOR_KEYS) {
    const upstreamKey = UPSTREAM_KEY_MAP[key];
    const value = parsed[upstreamKey as keyof NativeScheme] as NativeColorInput;
    const { color, authored } = resolveNativeColor(value);
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

// Counterpart metadata (issue #128): unambiguous light/dark stem families
// pair automatically, curated overrides resolve the ambiguous ones.
function assignCounterparts(themes: TerminalColorTheme[]): void {
  const counterparts = computeCounterparts(themes);
  for (const theme of themes) {
    const counterpart = counterparts.get(theme.slug);
    if (counterpart !== undefined) theme.counterpart = counterpart;
  }
}

// Accent metadata (issue #133): cursor-if-chromatic-else-most-chromatic-ANSI
// heuristic, overridden by CURATED_ACCENT_OVERRIDES where curated. Every
// theme gets one — cursor always exists, so the heuristic never falls
// through empty-handed.
function assignAccents(themes: TerminalColorTheme[]): void {
  for (const theme of themes) {
    theme.accent = computeAccent(theme.slug, theme.colors);
  }
}

// Corpus split for the build summary log — how many themes land on each
// accent source (cursor vs each classic ANSI slot).
function summarizeAccentSources(themes: readonly TerminalColorTheme[]): string {
  const counts = new Map<string, number>();
  for (const t of themes) {
    const src = t.accent?.source ?? 'none';
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source}=${count}`)
    .join(', ');
}

function toSlim(theme: TerminalColorTheme): SlimTheme {
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
  };
}

function sourceRootDir(source: SourceConfig): string {
  return source.local === true ? ROOT : join(UPSTREAM_DIR, source.id);
}

function readSourceFiles(source: SourceConfig): string[] {
  const dir = join(sourceRootDir(source), source.themesPath);
  if (!existsSync(dir)) {
    const hint =
      source.local === true ? '(local source)' : 'Run: pnpm tsx scripts/fetch-upstream.ts';
    console.error(`Missing source directory: ${dir}. ${hint}`);
    process.exit(1);
  }
  const exclude = new Set(source.excludeFiles ?? []);
  const ext = source.fileExtension ?? defaultExtensionFor(sourceFormat(source));
  // Ghostty config files conventionally have no extension; everything else
  // uses extension-based filtering. Directories are always excluded.
  const matches = (name: string): boolean =>
    ext === '' ? !name.includes('.') : name.endsWith(ext);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter(matches)
    .filter((f) => !exclude.has(f))
    .sort();
}

interface CollectedTheme {
  theme: TerminalColorTheme;
  source: string;
  file: string;
}

interface CollectResult {
  themes: TerminalColorTheme[];
  droppedDuplicates: string[];
  failures: Array<{ file: string; error: string }>;
}

function collectFromSource(
  source: SourceConfig,
  sha: string,
  updatedAt: string,
  seenBySlug: Map<string, CollectedTheme>,
): CollectResult {
  const themes: TerminalColorTheme[] = [];
  const droppedDuplicates: string[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  const parse = parserFor(sourceFormat(source));
  for (const file of readSourceFiles(source)) {
    const fullPath = join(sourceRootDir(source), source.themesPath, file);
    try {
      const content = readFileSync(fullPath, 'utf8');
      // Native sources accept hex-or-OKLCH per slot; every other source stays
      // on the hex-only UpstreamSchemeSchema path. See issue #132.
      const theme =
        source.nativeAuthoring === true
          ? buildNativeTheme(parseNativeJson(content), source, file, sha, updatedAt)
          : buildTheme(parse(content, nameFromFilename(file)), source, file, sha, updatedAt);
      const prior = seenBySlug.get(theme.slug);
      if (prior !== undefined) {
        if (prior.source === source.id) {
          failures.push({
            file,
            error: `Duplicate slug "${theme.slug}" within source "${source.id}" (also from ${prior.file})`,
          });
          continue;
        }
        droppedDuplicates.push(
          `[${source.id}] ${file} (slug "${theme.slug}") dropped — already provided by [${prior.source}] ${prior.file}`,
        );
        continue;
      }
      seenBySlug.set(theme.slug, { theme, source: source.id, file });
      themes.push(theme);
    } catch (err) {
      failures.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { themes, droppedDuplicates, failures };
}

function main(): void {
  const sources = loadSources();
  const shas = loadShas();
  for (const s of sources) {
    if (typeof shas[s.id] !== 'string' || shas[s.id]?.length === 0) {
      console.error(`Missing SHA for source "${s.id}" in ${SHAS_FILE}.`);
      process.exit(1);
    }
  }

  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(BY_NAME_DIR, { recursive: true });
  const updatedAt = new Date().toISOString();

  const themes: TerminalColorTheme[] = [];
  // Slug collisions: first source wins (sources.json order is priority).
  const seenBySlug = new Map<string, CollectedTheme>();
  const droppedDuplicates: string[] = [];
  const failures: Array<{ file: string; error: string }> = [];

  for (const source of sources) {
    const result = collectFromSource(source, shas[source.id] as string, updatedAt, seenBySlug);
    themes.push(...result.themes);
    droppedDuplicates.push(...result.droppedDuplicates);
    failures.push(...result.failures);
  }

  if (failures.length > 0) {
    console.error(`Failures (${failures.length}):`);
    for (const f of failures) console.error(`  ${f.file}: ${f.error}`);
    process.exit(1);
  }

  if (droppedDuplicates.length > 0) {
    console.warn(`Dropped ${droppedDuplicates.length} cross-source duplicate(s):`);
    for (const m of droppedDuplicates) console.warn(`  ${m}`);
  }

  themes.sort((a, b) => a.slug.localeCompare(b.slug));
  assignCounterparts(themes);
  assignAccents(themes);

  writeFileSync(join(DATA_DIR, 'themes.json'), JSON.stringify(themes, null, 2) + '\n');
  writeFileSync(
    join(DATA_DIR, 'themes-slim.json'),
    JSON.stringify(themes.map(toSlim), null, 2) + '\n',
  );

  const primarySha = shas[sources[0]!.id] as string;
  const index: ThemeIndex = {
    generatedAt: updatedAt,
    upstreamShas: shas,
    upstreamSha: primarySha,
    count: themes.length,
    themes: themes.map((t) => ({
      name: t.name,
      slug: t.slug,
      isDark: t.isDark,
      tags: t.tags,
      ...(t.counterpart !== undefined ? { counterpart: t.counterpart } : {}),
      ...(t.accent !== undefined ? { accent: toAccentSlim(t.accent) } : {}),
    })),
  };
  writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  for (const theme of themes) {
    writeFileSync(join(BY_NAME_DIR, `${theme.slug}.json`), JSON.stringify(theme, null, 2) + '\n');
  }

  const counts = sources.map((s) => `[${s.id}] ${themes.filter((t) => t.source === s.id).length}`);
  const withCounterpart = themes.filter((t) => t.counterpart !== undefined).length;
  console.log(
    `Built ${themes.length} themes across ${sources.length} sources: ${counts.join(', ')}`,
  );
  console.log(`${withCounterpart} themes have a counterpart.`);
  console.log(`Accent source split: ${summarizeAccentSources(themes)}`);
}

main();
