#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertHexToColor, resolveNativeColor } from '../src/convert.js';
import { classifyTheme } from '../src/classify.js';
import { computeAccent, toAccentSlim } from '../src/accent.js';
import { computeDataviz, toDatavizSlim } from '../src/dataviz.js';
import { computeCounterparts } from '../src/counterpart.js';
import { toSlug } from '../src/slug.js';
import { SourcesConfigSchema, type SourceConfig, type SourceFormat } from '../src/sources.js';
import { defaultExtensionFor, parserFor } from '../src/parsers/index.js';
import { parseNativeJson } from '../src/parsers/native.js';
import { preserveIndexGeneratedAt, preserveThemeUpdatedAt } from '../src/preserve.js';
import { writeExportArtifacts } from './write-exports.js';
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

// Dataviz metadata (issue #150): pure functions over `colors` + `accent` —
// must run after `assignAccents`, since the categorical seed, the sequential
// ramp's endpoint, and the diverging ramp's first arm are all derived from
// each theme's own `accent`.
function assignDataviz(themes: TerminalColorTheme[]): void {
  for (const theme of themes) {
    // theme.accent is always set by this point (assignAccents runs first,
    // unconditionally, for every theme) — the `as` documents that invariant
    // rather than threading an unnecessary optional through computeDataviz.
    theme.dataviz = computeDataviz(theme.colors, theme.accent as NonNullable<typeof theme.accent>);
  }
}

// Corpus stats for the build summary log — categorical size distribution
// (how many themes land on 6 vs 7 vs 8 colors).
function summarizeCategoricalSizes(themes: readonly TerminalColorTheme[]): string {
  const counts = new Map<number, number>();
  for (const t of themes) {
    const size = t.dataviz?.categorical.length ?? 0;
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, count]) => `${size}=${count}`)
    .join(', ');
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

// Corpus stats for the build summary log — how many themes clear
// CVD_SAFE_THRESHOLD on both deuteranopia and protanopia (issue #149).
// Expected to be a small minority: most of this corpus is decorative
// community themes never designed with CVD safety in mind (see src/cvd.ts's
// threshold rationale).
function summarizeCvd(themes: readonly TerminalColorTheme[]): string {
  const cvdSafe = themes.filter((t) => t.tags.includes('cvd-safe')).length;
  return `cvd-safe=${cvdSafe}, cvd-caution=${themes.length - cvdSafe} (of ${themes.length})`;
}

// Corpus stats for the build summary log — where APCA and WCAG disagree
// (issue #151): themes that already pass `wcag-aa` (>= 4.5:1 fgOnBg) yet
// have |Lc| < 45, i.e. APCA's body-text-adjacent range considers them
// meaningfully weaker than WCAG2 does. Logged, not gated — DATA ONLY,
// nothing tags/fails on this.
function summarizeApcaWcagDisagreement(themes: readonly TerminalColorTheme[]): string {
  const disagreements = themes.filter(
    (t) => t.tags.includes('wcag-aa') && Math.abs(t.apca?.fgOnBg ?? 0) < 45,
  );
  if (disagreements.length === 0) {
    return `${disagreements.length} theme(s) pass wcag-aa but have |Lc| < 45`;
  }
  const examples = disagreements
    .slice(0, 5)
    .map((t) => t.slug)
    .join(', ');
  return `${disagreements.length} theme(s) pass wcag-aa but have |Lc| < 45 (e.g. ${examples})`;
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
    ...(theme.dataviz !== undefined ? { dataviz: toDatavizSlim(theme.dataviz) } : {}),
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

// Loads the by-name records currently on disk, keyed by slug, so a rebuild
// can compare each freshly-built theme against its previous version before
// `DATA_DIR` gets wiped — see `preserveThemeUpdatedAt` / issue #140. Absent
// entirely on a first build (or an unreadable individual file, which is
// treated as "no previous record" rather than aborting the whole build).
function loadPreviousThemesBySlug(): Map<string, TerminalColorTheme> {
  const bySlug = new Map<string, TerminalColorTheme>();
  if (!existsSync(BY_NAME_DIR)) return bySlug;
  for (const file of readdirSync(BY_NAME_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(
        readFileSync(join(BY_NAME_DIR, file), 'utf8'),
      ) as TerminalColorTheme;
      bySlug.set(parsed.slug, parsed);
    } catch {
      // Corrupt/unreadable previous file — fall back to treating it as new.
    }
  }
  return bySlug;
}

// Loads the previous `index.json`, for `generatedAt` preservation — same
// "no previous record" fallback as `loadPreviousThemesBySlug`.
function loadPreviousIndex(): ThemeIndex | undefined {
  const path = join(DATA_DIR, 'index.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ThemeIndex;
  } catch {
    return undefined;
  }
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

  // Must run before `rmSync` below wipes `DATA_DIR` out from under us.
  const previousThemesBySlug = loadPreviousThemesBySlug();
  const previousIndex = loadPreviousIndex();

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
  assignDataviz(themes);

  // Carry each theme's previous `updatedAt` forward when nothing else about
  // it changed, instead of always stamping the current build time — see
  // issue #140. Must run before any of the writes below so `themes.json` /
  // `themes-slim.json` / `index.json` all derive from the corrected value.
  for (const theme of themes) {
    theme.updatedAt = preserveThemeUpdatedAt(theme, previousThemesBySlug.get(theme.slug));
  }

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
  // Same preserve-if-unchanged rule as per-theme `updatedAt`, applied to the
  // index's own top-level timestamp — issue #140.
  index.generatedAt = preserveIndexGeneratedAt(index, previousIndex);
  writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  for (const theme of themes) {
    writeFileSync(join(BY_NAME_DIR, `${theme.slug}.json`), JSON.stringify(theme, null, 2) + '\n');
  }

  // Static export artifacts (issues #146, #147): base16/base24 scheme YAML +
  // static per-theme CSS. Pure functions of each theme's own `colors`/`name`/
  // `isDark` — deterministic, no timestamps, so a no-op rebuild produces a
  // byte-identical tree here too (same property `preserveThemeUpdatedAt`
  // maintains for `data/by-name/*.json`, issue #141/#140).
  writeExportArtifacts(themes, sources, DATA_DIR);

  const counts = sources.map((s) => `[${s.id}] ${themes.filter((t) => t.source === s.id).length}`);
  const withCounterpart = themes.filter((t) => t.counterpart !== undefined).length;
  console.log(
    `Built ${themes.length} themes across ${sources.length} sources: ${counts.join(', ')}`,
  );
  console.log(`${withCounterpart} themes have a counterpart.`);
  console.log(`Accent source split: ${summarizeAccentSources(themes)}`);
  // Corpus stats for the new cursor/selection/brightness metadata (issue
  // #145) — the interesting number is brightness-ordering violators, a real
  // bug class rather than a stylistic preference.
  const cursorVisible = themes.filter((t) => t.tags.includes('cursor-visible')).length;
  const selectionLegible = themes.filter((t) => t.tags.includes('selection-legible')).length;
  const brightnessOrdered = themes.filter((t) => t.tags.includes('brightness-ordered')).length;
  console.log(
    `Contrast metadata: cursor-visible=${cursorVisible}, selection-legible=${selectionLegible}, brightness-ordered=${brightnessOrdered} (of ${themes.length})`,
  );
  // Corpus stats for the new dataviz block (issue #150) — categorical size
  // distribution (6 vs 7 vs 8) is the interesting number: it shows how many
  // themes have enough distinct chromatic ANSI hues to earn extra categorical
  // slots vs settling at the 6-color floor.
  console.log(`Dataviz categorical size distribution: ${summarizeCategoricalSizes(themes)}`);
  // Corpus stats for the new cvd/apca blocks (issues #149, #151).
  console.log(`CVD metadata: ${summarizeCvd(themes)}`);
  console.log(`APCA vs WCAG: ${summarizeApcaWcagDisagreement(themes)}`);
  console.log(
    `Export artifacts: ${themes.length} base16 schemes, ${themes.length} base24 schemes, ${themes.length} CSS files.`,
  );
}

main();
