// Source collection: which files in a source directory are themes, and what
// happens when two of them claim the same slug.
//
// Extracted from `scripts/build.ts` (issue #175). The slug-collision rule
// here is a user-visible contract — it decides which project's "Dracula"
// ships — and it previously had no test because it was welded to `readdirSync`
// and `readFileSync`. File access is now injected via `SourceReader`, so the
// policy can be exercised with in-memory fixtures. Build tooling, not public
// API: deliberately not re-exported from `src/index.ts`.
import { buildNativeTheme, buildTheme, nameFromFilename } from './assemble.js';
import { defaultExtensionFor, parserFor } from './parsers/index.js';
import { parseNativeJson } from './parsers/native.js';
import type { SourceConfig, SourceFormat } from './sources.js';
import type { TerminalColorTheme, ThemeIndex } from './types.js';

export function sourceFormat(source: SourceConfig): SourceFormat {
  return source.format ?? 'windowsterminal-json';
}

// Ghostty config files conventionally have no extension; everything else
// uses extension-based filtering.
export function matchesSourceExtension(name: string, ext: string): boolean {
  return ext === '' ? !name.includes('.') : name.endsWith(ext);
}

// Pure half of the old `readSourceFiles`: given the file names in a source
// directory (directories already excluded by the caller), decide which are
// themes and in what order. Sorted so a rebuild is deterministic.
export function selectSourceFiles(names: readonly string[], source: SourceConfig): string[] {
  const exclude = new Set(source.excludeFiles ?? []);
  const ext = source.fileExtension ?? defaultExtensionFor(sourceFormat(source));
  return names
    .filter((name) => matchesSourceExtension(name, ext))
    .filter((name) => !exclude.has(name))
    .slice()
    .sort();
}

// File access, injected so `collectFromSource` can run against in-memory
// fixtures. `list` returns every file name in the source directory; the
// extension/exclude filtering is `selectSourceFiles`' job.
export interface SourceReader {
  list(source: SourceConfig): readonly string[];
  read(source: SourceConfig, file: string): string;
}

export interface CollectedTheme {
  theme: TerminalColorTheme;
  source: string;
  file: string;
}

export interface CollectResult {
  themes: TerminalColorTheme[];
  droppedDuplicates: string[];
  failures: Array<{ file: string; error: string }>;
}

// Builds every theme in one source, enforcing the slug-collision policy
// against `seenBySlug` (which accumulates across sources, in `sources.json`
// order — so the first source listed wins a cross-source tie).
//
// The two collision cases are deliberately different severities:
//   - same source, duplicate slug   -> a failure, because it means the source
//     itself is inconsistent and one of its themes would be silently lost.
//   - different source, same slug   -> a drop with a warning, because sources
//     legitimately overlap (half of them ship a "Dracula") and priority
//     order is the intended resolution, not an error.
export function collectFromSource(
  source: SourceConfig,
  sha: string,
  updatedAt: string,
  seenBySlug: Map<string, CollectedTheme>,
  reader: SourceReader,
): CollectResult {
  const themes: TerminalColorTheme[] = [];
  const droppedDuplicates: string[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  const parse = parserFor(sourceFormat(source));
  for (const file of selectSourceFiles(reader.list(source), source)) {
    try {
      const content = reader.read(source, file);
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

export interface PreviousThemesResult {
  bySlug: Map<string, TerminalColorTheme>;
  /** Files that could not be used as a previous record, with the reason. */
  unreadable: Array<{ file: string; reason: string }>;
}

// Pure half of the old `loadPreviousThemesBySlug`. A previous record that
// cannot be read is treated as "no previous record" rather than aborting the
// build — but it is now *reported* instead of swallowed, because the failure
// mode is invisible otherwise: every unreadable file re-stamps its theme's
// `updatedAt`, turning the nightly sync into an all-noise diff (issue #140).
//
// A file that parses as JSON but has no string `slug` is unreadable too. It
// previously keyed the map under `undefined`, so one stray non-theme JSON
// file could shadow a real record.
export function parsePreviousThemes(
  entries: Iterable<{ file: string; content: string }>,
): PreviousThemesResult {
  const bySlug = new Map<string, TerminalColorTheme>();
  const unreadable: Array<{ file: string; reason: string }> = [];
  for (const { file, content } of entries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      unreadable.push({ file, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const slug = (parsed as { slug?: unknown } | null)?.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      unreadable.push({ file, reason: 'no string "slug" field' });
      continue;
    }
    bySlug.set(slug, parsed as TerminalColorTheme);
  }
  return { bySlug, unreadable };
}

// Pure half of the old `loadPreviousIndex` — same "no previous record"
// fallback, for the index's own `generatedAt` (issue #140).
export function parsePreviousIndex(content: string | undefined): ThemeIndex | undefined {
  if (content === undefined) return undefined;
  try {
    return JSON.parse(content) as ThemeIndex;
  } catch {
    return undefined;
  }
}
