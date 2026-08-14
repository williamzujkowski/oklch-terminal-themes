#!/usr/bin/env tsx
/**
 * Packed-tarball consumer test (issue #182).
 *
 * Every other check in this repo runs against the working tree, where pnpm
 * has hoisted every devDependency and every file is on disk. That is not what
 * a consumer gets, and the gap is not theoretical: `0.7.0` shipped with `zod`
 * in `devDependencies` while `dist/schema.js` imports it at module top level,
 * so the published package could not be imported at all. Lint, typecheck,
 * build and 238 tests all passed.
 *
 * This packs the real tarball, installs it into a scratch consumer the way a
 * user would, and checks the things only that configuration can reveal:
 *
 *  1. the entrypoint imports with `--omit=dev` (catches a runtime dep in the
 *     wrong section)
 *  2. every `exports` subpath actually resolves
 *  3. a single named import tree-shakes, so `apca-w3`'s AGPL-licensed
 *     `colorparsley` transitive does not land in consumer bundles (issue #169)
 *  4. the tarball stays inside a size/file-count budget
 *
 * Run locally with `pnpm verify:package`. Takes ~30s, mostly npm install.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string;
  exports: Record<string, unknown>;
};

// Budgets. Deliberately loose enough not to trip on ordinary data churn, tight
// enough to catch a category change (a new per-theme artifact directory, a
// stray `src/` include).
//
// The file count was raised from 3,000 to 3,400 for the DTCG token export
// (#148), which is one file per theme. That is the guard working rather than
// being worked around: it fired on exactly the category change it was written
// to catch, and the number moved as a deliberate decision with the cost
// measured first.
//
//   before  2,682 files, 1.65 MB packed
//   after   3,326 files, 1.88 MB packed  (+644 files, 5.1 MB uncompressed)
//
// `MAX_PACKED_BYTES` is untouched and still has ~40% headroom, because the
// token files compress well. The file count is the binding constraint on this
// package, not the byte count — worth knowing before adding a fifth per-theme
// artifact directory, since another one would need this raised again and the
// tarball would then hold four generated files for every source theme.
const MAX_PACKED_BYTES = 3_000_000;
const MAX_FILE_COUNT = 3_400;

// Symbols that must never reach a consumer bundle from a single named import.
// `colorparsley` is the AGPL-3.0 transitive of `apca-w3` that issue #169 was
// opened about.
const FORBIDDEN_BUNDLE_SYMBOLS = ['colorparsley', 'calcAPCA', 'sRGBtoY'];

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ok    ${label}`);
    return;
  }
  console.error(`  FAIL  ${label}${detail === '' ? '' : ` — ${detail}`}`);
  failures.push(label);
}

function packTarball(work: string): { tarball: string; files: number; bytes: number } {
  const json = run('npm', ['pack', '--json', '--pack-destination', work], ROOT);
  const [meta] = JSON.parse(json) as { filename: string; size: number; entryCount: number }[];
  if (meta === undefined) throw new Error('npm pack produced no output');
  return { tarball: join(work, meta.filename), files: meta.entryCount, bytes: meta.size };
}

function installConsumer(work: string, tarball: string): string {
  const consumer = join(work, 'consumer');
  run('mkdir', ['-p', consumer], work);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'scratch-consumer', private: true, type: 'module' }),
  );
  // --omit=dev is the whole point: it is the one configuration the workspace
  // can never reproduce, because pnpm hoists devDependencies here.
  run('npm', ['install', tarball, '--omit=dev', '--no-audit', '--no-fund'], consumer);
  return consumer;
}

function checkEntrypoint(consumer: string): void {
  const probe = join(consumer, 'probe.mjs');
  writeFileSync(
    probe,
    `import * as m from '${PKG.name}';\n` +
      `if (typeof m.themeToCssVars !== 'function') throw new Error('themeToCssVars missing');\n` +
      `if (!Array.isArray(m.COLOR_KEYS)) throw new Error('COLOR_KEYS missing');\n` +
      `if (typeof m.classifyTheme !== 'function') throw new Error('classifyTheme missing');\n` +
      `console.log(Object.keys(m).length);\n`,
  );
  try {
    const count = run('node', [probe], consumer).trim();
    check(`entrypoint imports with --omit=dev (${count} exports)`, true);
  } catch (err) {
    check(
      'entrypoint imports with --omit=dev',
      false,
      String(err).split('\n').slice(0, 3).join(' '),
    );
  }
}

/**
 * Expands an `exports` subpath pattern into a concrete specifier.
 *
 * Node's subpath-pattern spec allows **at most one** `*` per key, so the
 * expansion is a single splice. Written explicitly rather than via
 * `String.replace('*', ...)`, whose replace-first-occurrence-only behaviour
 * is ambiguous here and is flagged by CodeQL's `js/incomplete-sanitization`:
 * a reader cannot tell whether one match was intended or merely assumed.
 * `dracula` is present in every build.
 */
function expandSubpathPattern(key: string): string {
  const star = key.indexOf('*');
  if (star < 0) return key;
  if (key.indexOf('*', star + 1) >= 0) {
    throw new Error(`exports key "${key}" has more than one "*", which Node does not allow`);
  }
  // The star value must not duplicate an extension the pattern already
  // supplies. `./themes/*` needs `dracula.json`, but `./themes/*.json` needs
  // a bare `dracula` — substituting the same sample into both yields
  // `dracula.json.json`, which resolves to nothing. This bit me the moment
  // #258 tightened the patterns from `./themes/*` to `./themes/*.json`: the
  // test failed and the exports map was the thing that got better.
  // The star value has to satisfy the pattern AND land on a real file, and
  // neither is guaranteed by a single global sample:
  //
  //   ./themes/*        needs `dracula.json`  (pattern supplies no extension)
  //   ./themes/*.json   needs `dracula`       (pattern supplies it)
  //   ./schemes/*.yaml  needs `base24/dracula` (target is a nested directory)
  //
  // Using one sample for all of them produced `dracula.json.json` and
  // `schemes/dracula.yaml`, neither of which exists. This only surfaced when
  // #258 tightened the patterns and added the css/schemes subpaths — the
  // exports map got better and the test broke, which is the wrong way round.
  const suffix = key.slice(star + 1);
  const prefix = key.slice(0, star);
  const base = /\.[a-z0-9]+$/i.test(suffix) ? 'dracula' : 'dracula.json';
  const starValue = prefix.includes('/schemes/') ? `base24/${base}` : base;
  return `${prefix}${starValue}${suffix}`;
}

function checkSubpaths(consumer: string): void {
  const subpaths = Object.keys(PKG.exports)
    .filter((k) => k !== '.')
    .map(expandSubpathPattern)
    .map((k) => `${PKG.name}${k.slice(1)}`);

  for (const specifier of subpaths) {
    // Only JSON can be `import`ed. A `.css` or `.yaml` subpath is still a
    // valid export — the consumer reads it with fs, or a bundler/CDN serves
    // it — so proving it RESOLVES and exists is the right check. Importing it
    // fails with ERR_UNKNOWN_FILE_EXTENSION, which says nothing about the
    // exports map.
    const isJson = specifier.endsWith('.json');
    const probe = join(consumer, 'sub.mjs');
    writeFileSync(
      probe,
      isJson
        ? `import data from '${specifier}' with { type: 'json' };\n` +
            `if (data === undefined || data === null) throw new Error('empty');\n`
        : `import { createRequire } from 'node:module';\n` +
            `import { statSync } from 'node:fs';\n` +
            `const require = createRequire(import.meta.url);\n` +
            `const p = require.resolve('${specifier}');\n` +
            `if (statSync(p).size === 0) throw new Error('empty file: ' + p);\n`,
    );
    try {
      run('node', [probe], consumer);
      check(`subpath resolves: ${specifier}`, true);
    } catch (err) {
      check(`subpath resolves: ${specifier}`, false, String(err).split('\n')[1] ?? '');
    }
  }
}

function checkTreeShaking(consumer: string): void {
  try {
    run('npm', ['install', 'esbuild', '--no-audit', '--no-fund'], consumer);
  } catch {
    check('tree-shaking probe (esbuild install)', false, 'could not install esbuild');
    return;
  }
  const entry = join(consumer, 'shake.mjs');
  writeFileSync(
    entry,
    `import { COLOR_KEYS } from '${PKG.name}';\nconsole.log(COLOR_KEYS.length);\n`,
  );
  const out = join(consumer, 'shaken.js');
  try {
    run(
      join(consumer, 'node_modules', '.bin', 'esbuild'),
      [entry, '--bundle', '--format=esm', '--minify', `--outfile=${out}`],
      consumer,
    );
  } catch (err) {
    // A bundler failure is itself a finding — most likely an unresolved
    // runtime import, i.e. exactly the `zod`-in-devDependencies defect this
    // script exists to catch. Report it as a failed check rather than
    // throwing, so the earlier checks' results still reach the reader.
    const message = String(err);
    const unresolved = /Could not resolve "([^"]+)"/.exec(message);
    check(
      'consumer bundle builds',
      false,
      unresolved === null
        ? 'esbuild failed — see output above'
        : `esbuild could not resolve "${unresolved[1]}" — is it a runtime import declared in devDependencies?`,
    );
    return;
  }
  const bundle = readFileSync(out, 'utf8');

  for (const symbol of FORBIDDEN_BUNDLE_SYMBOLS) {
    check(`single named import does not bundle "${symbol}"`, !bundle.includes(symbol));
  }
  // A bundle this small proves the whole dependency graph was dropped, not
  // just that a grep missed. Generous ceiling: the real figure is ~341 B.
  check(
    `single named import bundles small (${bundle.length} B)`,
    bundle.length < 50_000,
    'tree-shaking appears not to be working — is "sideEffects": false still set?',
  );
}

function main(): void {
  const work = mkdtempSync(join(tmpdir(), 'oktt-verify-'));
  console.log(`Packing and installing ${PKG.name} into a scratch consumer...`);
  try {
    const { tarball, files, bytes } = packTarball(work);
    console.log(`  tarball: ${(bytes / 1_000_000).toFixed(2)} MB packed, ${files} files\n`);

    check(
      `packed size within budget (${(bytes / 1_000_000).toFixed(2)} MB)`,
      bytes <= MAX_PACKED_BYTES,
    );
    check(`file count within budget (${files})`, files <= MAX_FILE_COUNT);

    const consumer = installConsumer(work, tarball);
    checkEntrypoint(consumer);
    checkSubpaths(consumer);
    checkTreeShaking(consumer);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} package check(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('Package verified: importable, subpaths resolve, tree-shakes, within budget.');
}

main();
