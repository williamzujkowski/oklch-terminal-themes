#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertHexToColor } from '../src/convert.js';
import { classifyTheme } from '../src/classify.js';
import { toSlug } from '../src/slug.js';
import { UpstreamSchemeSchema } from '../src/schema.js';
import { SourcesConfigSchema, type SourceConfig } from '../src/sources.js';
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

function buildTheme(
  raw: Record<string, unknown>,
  source: SourceConfig,
  filename: string,
  sha: string,
  updatedAt: string,
): TerminalColorTheme {
  const parsed = UpstreamSchemeSchema.parse(raw);
  const slug = toSlug(parsed.name);
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    const upstreamKey = UPSTREAM_KEY_MAP[key];
    const hex = parsed[upstreamKey as keyof typeof parsed] as string;
    colors[key] = convertHexToColor(hex);
  }
  const theme: TerminalColorTheme = {
    name: parsed.name,
    slug,
    isDark: false,
    tags: [],
    source: source.id,
    sourceUrl: `https://github.com/${source.repo}/blob/${sha}/${source.themesPath}/${filename}`,
    upstreamSha: sha,
    updatedAt,
    colors,
  };
  classifyTheme(theme);
  return theme;
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
  };
}

function readSourceFiles(source: SourceConfig): string[] {
  const dir = join(UPSTREAM_DIR, source.id, source.themesPath);
  if (!existsSync(dir)) {
    console.error(`Missing source directory: ${dir}. Run: pnpm tsx scripts/fetch-upstream.ts`);
    process.exit(1);
  }
  const exclude = new Set(source.excludeFiles ?? []);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
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
  for (const file of readSourceFiles(source)) {
    const fullPath = join(UPSTREAM_DIR, source.id, source.themesPath, file);
    try {
      const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
      const theme = buildTheme(raw, source, file, sha, updatedAt);
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
    themes: themes.map((t) => ({ name: t.name, slug: t.slug, isDark: t.isDark, tags: t.tags })),
  };
  writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  for (const theme of themes) {
    writeFileSync(join(BY_NAME_DIR, `${theme.slug}.json`), JSON.stringify(theme, null, 2) + '\n');
  }

  const counts = sources.map((s) => `[${s.id}] ${themes.filter((t) => t.source === s.id).length}`);
  console.log(
    `Built ${themes.length} themes across ${sources.length} sources: ${counts.join(', ')}`,
  );
}

main();
