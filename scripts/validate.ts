#!/usr/bin/env tsx
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { TerminalColorThemeSchema } from '../src/schema.js';
import { findAccentErrors } from '../src/accent.js';
import { findDatavizErrors } from '../src/dataviz.js';
import { findCounterpartErrors } from '../src/counterpart.js';
import { roundTripDeltaE, oklchRoundTripDeltaE } from '../src/convert.js';
import { COLOR_KEYS } from '../src/types.js';
import type { TerminalColorTheme } from '../src/types.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = join(ROOT, 'data');
const DELTA_E_THRESHOLD = 1.0;

/**
 * Parses every emitted scheme YAML back with a real parser (issue #194).
 *
 * `src/schemes.ts` hand-rolls its YAML serialization, and nothing ever read
 * it back — so a serialization bug could only be discovered by a downstream
 * tinty/base16 consumer hitting an unparseable file. That is the actual
 * defect; extending the escaper is only today's instance of it.
 *
 * Checks the file parses AND that the round-tripped `name` equals the theme's
 * own name, which is what catches an escaping bug rather than merely a
 * syntax error: a mangled-but-still-valid scalar would pass a parse check.
 */
function findSchemeYamlErrors(themes: readonly TerminalColorTheme[]): string[] {
  const errors: string[] = [];
  const bySlug = new Map(themes.map((t) => [t.slug, t]));

  for (const system of ['base16', 'base24']) {
    const dir = join(DATA_DIR, 'schemes', system);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
    } catch {
      errors.push(`data/schemes/${system}: directory missing`);
      continue;
    }

    for (const file of files) {
      const slug = file.replace(/\.yaml$/, '');
      const raw = readFileSync(join(dir, file), 'utf8');
      let parsed: unknown;
      try {
        parsed = parseYaml(raw);
      } catch (err) {
        errors.push(`${system}/${file}: unparseable YAML — ${(err as Error).message}`);
        continue;
      }
      const doc = parsed as { name?: unknown; palette?: Record<string, unknown> };
      const expected = bySlug.get(slug);
      if (expected === undefined) {
        errors.push(`${system}/${file}: no theme with slug "${slug}"`);
        continue;
      }
      if (doc.name !== expected.name) {
        errors.push(
          `${system}/${file}: name round-trip mismatch — got ${JSON.stringify(doc.name)}, expected ${JSON.stringify(expected.name)}`,
        );
      }
      if (typeof doc.palette !== 'object' || doc.palette === null) {
        errors.push(`${system}/${file}: palette missing or not a mapping`);
      }
    }
  }
  return errors;
}

function main(): void {
  const themes = JSON.parse(
    readFileSync(join(DATA_DIR, 'themes.json'), 'utf8'),
  ) as TerminalColorTheme[];

  const errors: string[] = [];
  let maxDeltaE = 0;

  for (const theme of themes) {
    const parsed = TerminalColorThemeSchema.safeParse(theme);
    if (!parsed.success) {
      errors.push(`${theme.slug}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    // Issue #132: OKLCH-authored slots invert the round-trip direction —
    // authored oklch -> derived hex -> oklch — since for those slots the
    // authored oklch, not the derived hex, is the source of truth.
    const authoredKeys = new Set(theme.oklchAuthored ?? []);
    for (const key of COLOR_KEYS) {
      const d = authoredKeys.has(key)
        ? oklchRoundTripDeltaE(theme.colors[key].oklch)
        : roundTripDeltaE(theme.colors[key].hex);
      if (d > maxDeltaE) maxDeltaE = d;
      if (d > DELTA_E_THRESHOLD) {
        errors.push(`${theme.slug}.${key}: ΔE2000=${d.toFixed(3)} exceeds ${DELTA_E_THRESHOLD}`);
      }
    }
  }

  // Counterpart metadata (issue #128): every `counterpart` reference must
  // exist in the dataset and have the opposite `isDark` polarity.
  errors.push(...findCounterpartErrors(themes));

  // Accent metadata (issue #133): every `accent.source` must be a valid slot
  // key present on the theme, and the carried color must exactly equal
  // `colors[source]` — the accent is a reference, never a new color.
  errors.push(...findAccentErrors(themes));

  // Dataviz metadata (issue #150): categorical/diverging length bounds,
  // sequential L monotonicity, and gamut-clamped round-trip ΔE on every
  // derived dataviz color — same threshold as the per-color check above.
  errors.push(...findDatavizErrors(themes, DELTA_E_THRESHOLD));

  // Emitted scheme YAML (issue #194): every data/schemes/**/<slug>.yaml must
  // parse with a real YAML parser, and its `name` must round-trip exactly.
  errors.push(...findSchemeYamlErrors(themes));

  console.log(`Validated ${themes.length} themes. Max round-trip ΔE2000 = ${maxDeltaE.toFixed(4)}`);
  if (errors.length > 0) {
    console.error(`${errors.length} errors:`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log('All themes valid.');
}

main();
