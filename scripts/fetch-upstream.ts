#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PinnedShasSchema, SourcesConfigSchema, type SourceConfig } from '../src/sources.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const UPSTREAM_DIR = join(ROOT, 'upstream');
const SOURCES_FILE = join(ROOT, 'sources.json');
const SHAS_FILE = join(ROOT, '.upstream-shas.json');

/**
 * Run a git command with an explicit argument array. Using `execFileSync`
 * (no shell) ensures arguments — including absolute paths derived from
 * `import.meta.url` — are passed verbatim and never interpreted by a shell,
 * eliminating SHELL command injection.
 *
 * It does NOT prevent ARGUMENT injection, and this comment previously claimed
 * injection was "eliminated" full stop, which is only half true (issue #193).
 * git subcommands accept options after positional arguments, so a value that
 * reaches an argument slot can still be read as a flag — `--upload-pack=...`
 * on `git fetch` being the classic case. Values that reach this function must
 * therefore be validated by the caller, and refs are passed after `--`.
 */
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function loadSources(): SourceConfig[] {
  const raw = JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) as unknown;
  return SourcesConfigSchema.parse(raw);
}

function loadPinnedShas(): Record<string, string> {
  if (!existsSync(SHAS_FILE)) return {};
  const raw = JSON.parse(readFileSync(SHAS_FILE, 'utf8')) as unknown;
  const parsed = PinnedShasSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`.upstream-shas.json is malformed — ${detail}`);
  }
  return parsed.data;
}

function syncSource(source: SourceConfig, pinnedSha: string | undefined): string {
  const targetDir = join(UPSTREAM_DIR, source.id);
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
  const url = `https://github.com/${source.repo}.git`;
  git(
    ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--no-checkout', url, source.id],
    UPSTREAM_DIR,
  );
  git(['sparse-checkout', 'set', source.themesPath], targetDir);
  if (pinnedSha !== undefined && pinnedSha.length > 0) {
    // `--` terminates option parsing on fetch, so the ref cannot be read as
    // a flag even if the schema check above were bypassed (issue #193).
    git(['fetch', '--depth', '1', 'origin', '--', pinnedSha], targetDir);
    // Deliberately NO `--` here: for `git checkout` the separator marks what
    // follows as a PATHSPEC, not a ref, so `git checkout -- <sha>` fails with
    // "pathspec ... did not match any file(s)". Verified both forms directly.
    // This argument's safety rests on PinnedShasSchema, which constrains it
    // to hex or the literal `local` — a leading `-` cannot get this far.
    git(['checkout', pinnedSha], targetDir);
  } else {
    git(['checkout'], targetDir);
  }
  return git(['rev-parse', 'HEAD'], targetDir);
}

function main(): void {
  const sources = loadSources();
  const pinned = loadPinnedShas();
  const resolved: Record<string, string> = {};

  if (!existsSync(UPSTREAM_DIR)) {
    mkdirSync(UPSTREAM_DIR, { recursive: true });
  }

  for (const source of sources) {
    if (source.local === true) {
      // Local sources live in this repo; nothing to clone. Pin SHA = "local"
      // so the build step can still write a uniform `.upstream-shas.json`.
      resolved[source.id] = 'local';
      console.log(`[${source.id}] local source — skipping clone`);
      continue;
    }
    const sha = syncSource(source, pinned[source.id]);
    resolved[source.id] = sha;
    console.log(`[${source.id}] synced at ${sha}`);
  }

  writeFileSync(SHAS_FILE, JSON.stringify(resolved, null, 2) + '\n');
  console.log(`Wrote ${SHAS_FILE} with ${sources.length} source SHAs.`);
}

main();
