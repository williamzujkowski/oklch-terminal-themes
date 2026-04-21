#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertHexToColor } from '../src/convert.js';
import { classifyTheme } from '../src/classify.js';
import { toSlug } from '../src/slug.js';
import { UpstreamSchemeSchema } from '../src/schema.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorKey, Colors, SlimTheme, TerminalColorTheme, ThemeIndex } from '../src/types.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const UPSTREAM_JSON_DIR = join(ROOT, 'upstream', 'windowsterminal');
const DATA_DIR = join(ROOT, 'data');
const BY_NAME_DIR = join(DATA_DIR, 'by-name');
const SHA_FILE = join(ROOT, '.upstream-sha');

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

function readSha(): string {
  if (!existsSync(SHA_FILE)) return 'HEAD';
  return readFileSync(SHA_FILE, 'utf8').trim();
}

function buildTheme(
  raw: Record<string, unknown>,
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
    source: 'iterm2-color-schemes',
    sourceUrl: `https://github.com/mbadolato/iTerm2-Color-Schemes/blob/${sha}/windowsterminal/${filename}`,
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

function main(): void {
  if (!existsSync(UPSTREAM_JSON_DIR)) {
    console.error(`Upstream directory missing: ${UPSTREAM_JSON_DIR}`);
    console.error('Run: pnpm tsx scripts/fetch-upstream.ts');
    process.exit(1);
  }

  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(BY_NAME_DIR, { recursive: true });

  const sha = readSha();
  const updatedAt = new Date().toISOString();
  const files = readdirSync(UPSTREAM_JSON_DIR).filter((f) => f.endsWith('.json'));

  const themes: TerminalColorTheme[] = [];
  const seenSlugs = new Map<string, string>();
  const failures: Array<{ file: string; error: string }> = [];

  for (const file of files) {
    const fullPath = join(UPSTREAM_JSON_DIR, file);
    try {
      const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
      const theme = buildTheme(raw, file, sha, updatedAt);
      const prior = seenSlugs.get(theme.slug);
      if (prior !== undefined) {
        failures.push({
          file,
          error: `Duplicate slug "${theme.slug}" (also from ${prior})`,
        });
        continue;
      }
      seenSlugs.set(theme.slug, file);
      themes.push(theme);
    } catch (err) {
      failures.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (failures.length > 0) {
    console.error(`Failures (${failures.length}):`);
    for (const f of failures) console.error(`  ${f.file}: ${f.error}`);
    process.exit(1);
  }

  themes.sort((a, b) => a.slug.localeCompare(b.slug));

  writeFileSync(join(DATA_DIR, 'themes.json'), JSON.stringify(themes, null, 2) + '\n');
  writeFileSync(
    join(DATA_DIR, 'themes-slim.json'),
    JSON.stringify(themes.map(toSlim), null, 2) + '\n',
  );
  const index: ThemeIndex = {
    generatedAt: updatedAt,
    upstreamSha: sha,
    count: themes.length,
    themes: themes.map((t) => ({ name: t.name, slug: t.slug, isDark: t.isDark, tags: t.tags })),
  };
  writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  for (const theme of themes) {
    writeFileSync(join(BY_NAME_DIR, `${theme.slug}.json`), JSON.stringify(theme, null, 2) + '\n');
  }

  console.log(`Built ${themes.length} themes at SHA ${sha}`);
}

main();
