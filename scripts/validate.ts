#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TerminalColorThemeSchema } from '../src/schema.js';
import { findAccentErrors } from '../src/accent.js';
import { findCounterpartErrors } from '../src/counterpart.js';
import { roundTripDeltaE, oklchRoundTripDeltaE } from '../src/convert.js';
import { COLOR_KEYS } from '../src/types.js';
import type { TerminalColorTheme } from '../src/types.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = join(ROOT, 'data');
const DELTA_E_THRESHOLD = 1.0;

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

  console.log(`Validated ${themes.length} themes. Max round-trip ΔE2000 = ${maxDeltaE.toFixed(4)}`);
  if (errors.length > 0) {
    console.error(`${errors.length} errors:`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log('All themes valid.');
}

main();
