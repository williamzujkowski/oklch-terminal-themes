import { UpstreamSchemeSchema, type UpstreamScheme } from '../schema.js';

/**
 * Parses an mbadolato-shape Windows Terminal JSON theme file. The schema is
 * also what ghostty/warp/jsonc parsers normalise to before returning, so this
 * module also exports the Zod boundary call that build.ts uses.
 */
export function parseWindowsTerminalJson(content: string): UpstreamScheme {
  const raw = JSON.parse(content) as Record<string, unknown>;
  return UpstreamSchemeSchema.parse(raw);
}
