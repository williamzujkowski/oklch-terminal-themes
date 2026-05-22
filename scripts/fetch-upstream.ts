#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SourcesConfigSchema, type SourceConfig } from '../src/sources.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const UPSTREAM_DIR = join(ROOT, 'upstream');
const SOURCES_FILE = join(ROOT, 'sources.json');
const SHAS_FILE = join(ROOT, '.upstream-shas.json');

/**
 * Run a git command with an explicit argument array. Using `execFileSync`
 * (no shell) ensures arguments — including absolute paths derived from
 * `import.meta.url` — are passed verbatim and never interpreted by a shell,
 * eliminating shell command injection.
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
  const raw = JSON.parse(readFileSync(SHAS_FILE, 'utf8')) as Record<string, string>;
  return raw;
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
    git(['fetch', '--depth', '1', 'origin', pinnedSha], targetDir);
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
