/**
 * Type declaration for `@williamzujkowski/oklch-terminal-themes/themes.json`.
 *
 * Without this, TypeScript infers the shape from the 5.8 MB literal and widens
 * every union member to its base type — `contrast.minAnsiSlot` becomes
 * `string` rather than `ColorKey`, `source` becomes `string` — so the import
 * is **not assignable** to the package's own exported `TerminalColorTheme[]`
 * and consumers had to write `as unknown as TerminalColorTheme[]` (#185).
 *
 * Declaring it also skips inference over that literal entirely, which is the
 * larger cost on a file this size.
 */
import type { TerminalColorTheme } from '../dist/index.js';

declare const themes: TerminalColorTheme[];
export default themes;
