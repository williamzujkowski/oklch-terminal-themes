/**
 * Shared "which ANSI slots count as text/foreground, and which conventionally
 * blend with the background" constants, used by both `classify.ts` (WCAG
 * `minAnsi`/`minAnsiSlot`) and `apca.ts` (APCA `minAnsi`/`minAnsiSlot`) so the
 * two "worst ANSI slot vs background" contrast metrics always walk the exact
 * same candidate set. Split into its own module (rather than living in
 * classify.ts and being imported by apca.ts) so neither module has to import
 * the other.
 */

import type { ColorKey } from './types.js';

// 16 ANSI slots (no bg/fg/cursor/selection). minAnsi contrast runs over a
// subset of these depending on isDark — see DARK_BG_BLENDS / LIGHT_BG_BLENDS.
export const ANSI_KEYS: readonly ColorKey[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'purple',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightPurple',
  'brightCyan',
  'brightWhite',
] as const;

// ANSI slots that are expected to be near-bg by convention — excluded from
// the "worst ANSI slot vs bg" calculation so we don't false-flag well-formed
// themes.
export const DARK_BG_BLENDS: ReadonlySet<ColorKey> = new Set(['black', 'brightBlack']);
export const LIGHT_BG_BLENDS: ReadonlySet<ColorKey> = new Set(['white', 'brightWhite']);
