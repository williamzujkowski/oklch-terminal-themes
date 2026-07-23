import { NativeSchemeSchema } from '../schema.js';
import type { NativeScheme } from '../schema.js';

/**
 * Parses a native (`data-sources/native/*.json`) theme source file — same
 * shape as the mbadolato Windows Terminal JSON schema, but every color slot
 * accepts hex OR OKLCH (`oklch(L C H)` string, or `{l, c, h}` object) per
 * issue #132. `scripts/build.ts` resolves each slot into a `ColorValue` via
 * `resolveNativeColor` and tracks which were OKLCH-authored.
 */
export function parseNativeJson(content: string): NativeScheme {
  const raw = JSON.parse(content) as Record<string, unknown>;
  return NativeSchemeSchema.parse(raw);
}
