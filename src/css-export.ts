/**
 * Static per-theme CSS artifact export (issue #147): wraps the existing
 * public `themeToCssVars` (see `src/index.ts`) in both a bare `:root` form
 * and a `[data-terminal-theme="<slug>"]`-scoped form, in one file, so a
 * static site/CodePen can consume a theme with a single `<link>` tag and
 * zero JS. Build/tooling module, like `src/schemes.ts` — not part of the
 * public package API surface (not re-exported from `src/index.ts`), imported
 * directly by `scripts/build.ts` and tests.
 *
 * Slugs are already sanitized by `src/slug.ts` (`toSlug` output is
 * constrained to `[a-z0-9]+(-[a-z0-9]+)*` — see `CounterpartSlugSchema`'s
 * regex for the same invariant enforced at the schema level), so using a
 * theme's own `slug` as both a filename and a CSS attribute-selector value
 * carries no path-traversal or selector-injection risk.
 */

import { themeToCssVars } from './index.js';
import type { Colors } from './types.js';

function indent(cssVars: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return cssVars
    .split('\n')
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join('\n');
}

/**
 * Builds the full static CSS file text for one theme: a header comment, a
 * bare `:root { ... }` block, and a `[data-terminal-theme="<slug>"] { ... }`
 * scoped block — both driving the same `--terminal-*` custom properties, so
 * a consumer can either `<link>` it globally or scope it to a container.
 */
export function themeToCssFile(theme: { slug: string; name: string; colors: Colors }): string {
  const vars = themeToCssVars(theme);
  const header = `/* ${theme.name} — oklch-terminal-themes — generated, do not edit by hand */\n`;
  const rootBlock = `:root {\n${indent(vars, 2)}\n}\n`;
  const scopedBlock = `[data-terminal-theme="${theme.slug}"] {\n${indent(vars, 2)}\n}\n`;
  return `${header}\n${rootBlock}\n${scopedBlock}`;
}
