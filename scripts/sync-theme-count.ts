#!/usr/bin/env tsx
// Keeps hardcoded "N themes" / "N terminal color schemes" copy in sync with
// the built dataset (`data/index.json` `count`) — see issue #122: "485" sat
// stale in 6+ user-facing places for 60 themes' worth of drift before anyone
// noticed, because nothing regenerated or checked it.
//
// Two jobs, run from `main()`:
//
//   1. Sync — rewrite every managed location to the live count:
//      - Marker-wrapped spots (`<!-- theme-count -->N<!-- /theme-count -->`)
//        in README.md, AGENTS.md, and site/public/og-image.svg.
//      - `package.json` `description`, which can't hold an HTML comment, so
//        it's synced by a narrower regex anchored to its fixed phrasing.
//   2. Guard — repo-wide scan (via `git ls-files`) for any *other* tracked
//      text file with a bare 3-4 digit number directly followed by
//      "themes" / "schemes" / "terminal color schemes". That shape is
//      exactly how "485" rotted in the first place, so a fresh one is
//      treated as an error rather than something that quietly drifts too.
//
// Run `pnpm sync-theme-count` to write, or `pnpm sync-theme-count:check`
// (wired into CI's `build` job, right after the dataset is rebuilt) to
// verify without writing — it fails if any managed location is stale or a
// new unmanaged hardcode has appeared.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const CHECK = process.argv.includes('--check');

const MARKER_RE = /<!--\s*theme-count\s*-->\d+<!--\s*\/theme-count\s*-->/g;
const markerText = (count: number): string => `<!-- theme-count -->${count}<!-- /theme-count -->`;

const MARKER_FILES = ['README.md', 'AGENTS.md', 'site/public/og-image.svg'];

const PACKAGE_JSON = 'package.json';
const PACKAGE_JSON_RE = /("description":\s*"[^"]*?)\d+( terminal color schemes)/;

// Guard scope: every git-tracked file that could plausibly carry
// user-facing prose, minus generated/vendored/already-managed paths.
const GUARD_EXCLUDE_PREFIXES = ['data/', 'upstream/', 'coverage/', 'dist/'];
const GUARD_EXCLUDE_FILES = new Set<string>(['CHANGELOG.md', PACKAGE_JSON, ...MARKER_FILES]);
const GUARD_EXTENSIONS = new Set(['.md', '.json', '.astro', '.ts', '.svg']);
const GUARD_RE = /\b\d{3,4}\b(?=\s+(?:terminal color schemes|themes|schemes)\b)/g;

interface Violation {
  file: string;
  message: string;
}

function readCount(): number {
  const index = JSON.parse(readFileSync(join(ROOT, 'data', 'index.json'), 'utf8')) as {
    count: number;
  };
  return index.count;
}

function listTrackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.length > 0);
}

function syncMarkerFile(relPath: string, count: number, violations: Violation[]): void {
  const abs = join(ROOT, relPath);
  const original = readFileSync(abs, 'utf8');
  if (!MARKER_RE.test(original)) {
    violations.push({ file: relPath, message: 'no theme-count marker found' });
    return;
  }
  const updated = original.replace(MARKER_RE, markerText(count));
  if (updated === original) return;
  if (CHECK) {
    violations.push({ file: relPath, message: `stale theme count (expected ${count})` });
    return;
  }
  writeFileSync(abs, updated);
}

function syncPackageJson(count: number, violations: Violation[]): void {
  const abs = join(ROOT, PACKAGE_JSON);
  const original = readFileSync(abs, 'utf8');
  if (!PACKAGE_JSON_RE.test(original)) {
    violations.push({ file: PACKAGE_JSON, message: 'description phrase not found' });
    return;
  }
  const updated = original.replace(PACKAGE_JSON_RE, `$1${count}$2`);
  if (updated === original) return;
  if (CHECK) {
    violations.push({ file: PACKAGE_JSON, message: `stale theme count (expected ${count})` });
    return;
  }
  writeFileSync(abs, updated);
}

function isGuardCandidate(file: string): boolean {
  if (GUARD_EXCLUDE_PREFIXES.some((p) => file.startsWith(p))) return false;
  if (GUARD_EXCLUDE_FILES.has(file)) return false;
  const dot = file.lastIndexOf('.');
  return dot !== -1 && GUARD_EXTENSIONS.has(file.slice(dot));
}

// Anything with a bare "NNN themes/schemes" outside the two managed
// mechanisms above is a fresh hardcode-in-waiting — fail so the author
// wraps it in theme-count markers (or computes it from the dataset, as
// site/src/layouts/BaseLayout.astro and ThemeSelector.astro do) instead.
function guardAgainstNewHardcodes(violations: Violation[]): void {
  for (const file of listTrackedFiles().filter(isGuardCandidate)) {
    const abs = join(ROOT, file);
    let text: string;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue; // e.g. deleted-but-still-listed in an edge case.
    }
    for (const match of text.matchAll(GUARD_RE)) {
      violations.push({
        file,
        message:
          `hardcoded "${match[0]} …" theme count found — wrap it in ` +
          '<!-- theme-count --> markers (see README.md) or compute it from ' +
          'the dataset at build time instead (see scripts/sync-theme-count.ts)',
      });
    }
  }
}

function main(): void {
  const count = readCount();
  const violations: Violation[] = [];

  for (const file of MARKER_FILES) syncMarkerFile(file, count, violations);
  syncPackageJson(count, violations);
  guardAgainstNewHardcodes(violations);

  if (violations.length > 0) {
    console.error(
      `Theme count sync found ${violations.length} issue(s) (dataset count = ${count}):`,
    );
    for (const v of violations) console.error(`  ${v.file}: ${v.message}`);
    if (CHECK) console.error('\nRun `pnpm sync-theme-count` and commit the result.');
    process.exit(1);
  }

  console.log(`Theme count in sync at ${count} (${MARKER_FILES.length + 1} managed location(s)).`);
}

main();
