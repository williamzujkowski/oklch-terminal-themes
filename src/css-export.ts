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
/**
 * Neutralizes CSS comment terminators in text destined for a `/* ... *\/`
 * comment.
 *
 * CSS comments have no escape mechanism — the only way to keep a value inside
 * one is to make sure it cannot contain the terminator. Theme names come from
 * third-party upstream repos that accept community submissions, and a name
 * containing `*` followed by `/` would close the header comment and let the
 * remainder of the name become live CSS rules in `data/css/<slug>.css` — a
 * file this package ships to npm and advertises as `<link>`-able (#190).
 *
 * `ThemeNameSchema` already rejects `*` outright, so in practice nothing
 * reaches here. This is the sink's own guard, kept independent of that
 * validation: escaping belongs where the value is interpolated, not only
 * where it entered.
 */
export function escapeCssComment(text: string): string {
  return text.replace(/\*\//g, '*\u2215');
}

export function themeToCssFile(theme: { slug: string; name: string; colors: Colors }): string {
  const vars = themeToCssVars(theme);
  const header = `/* ${escapeCssComment(theme.name)} — oklch-terminal-themes — generated, do not edit by hand */\n`;
  const rootBlock = `:root {\n${indent(vars, 2)}\n}\n`;
  const scopedBlock = `[data-terminal-theme="${theme.slug}"] {\n${indent(vars, 2)}\n}\n`;
  return `${header}\n${rootBlock}\n${scopedBlock}`;
}
