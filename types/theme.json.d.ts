/**
 * Type declaration for every `@williamzujkowski/oklch-terminal-themes/themes/<slug>.json`.
 *
 * One declaration serves all 633 per-theme files: the `exports` entry points
 * its `types` condition here while `default` keeps the `*` wildcard, so
 * consumers get `TerminalColorTheme` for any slug without shipping 633
 * near-identical `.d.ts` files. See `themes.json.d.ts` (#185).
 */
import type { TerminalColorTheme } from '../dist/index.js';

declare const theme: TerminalColorTheme;
export default theme;
