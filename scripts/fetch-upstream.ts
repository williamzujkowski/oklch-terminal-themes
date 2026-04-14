#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const UPSTREAM_URL = 'https://github.com/mbadolato/iTerm2-Color-Schemes.git';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const UPSTREAM_DIR = join(ROOT, 'upstream');
const SHA_FILE = join(ROOT, '.upstream-sha');

function sh(cmd: string, cwd: string = ROOT): string {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function pinnedSha(): string | null {
  if (!existsSync(SHA_FILE)) return null;
  const s = readFileSync(SHA_FILE, 'utf8').trim();
  return s.length > 0 ? s : null;
}

function sparseClone(): void {
  if (existsSync(UPSTREAM_DIR)) rmSync(UPSTREAM_DIR, { recursive: true, force: true });
  sh(
    `git clone --depth 1 --filter=blob:none --sparse --no-checkout ${UPSTREAM_URL} upstream`,
    ROOT,
  );
  sh('git sparse-checkout set windowsterminal', UPSTREAM_DIR);
  const sha = pinnedSha();
  if (sha !== null) {
    sh(`git fetch --depth 1 origin ${sha}`, UPSTREAM_DIR);
    sh(`git checkout ${sha}`, UPSTREAM_DIR);
  } else {
    sh('git checkout', UPSTREAM_DIR);
  }
}

function main(): void {
  sparseClone();
  const sha = sh('git rev-parse HEAD', UPSTREAM_DIR);
  writeFileSync(SHA_FILE, sha + '\n');
  console.log(`Upstream synced at SHA ${sha}`);
}

main();
