import { parseWindowsTerminalJson } from './windowsterminal.js';
import type { UpstreamScheme } from '../schema.js';

/**
 * Strips JSONC features (line comments, block comments, trailing commas) and
 * delegates to the windowsterminal-json parser. Used for theme repos that
 * publish `.jsonc` with a header comment block and trailing commas.
 */
export function parseWindowsTerminalJsonc(content: string): UpstreamScheme {
  return parseWindowsTerminalJson(stripJsonc(content));
}

function stripJsonc(src: string): string {
  // Pass 1: line comments. Match // outside of strings — naive, but our inputs
  // are simple theme files and don't have URLs in string values that would
  // false-positive. The block-comment + trailing-comma passes follow.
  const noLineComments = src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  // Pass 2: /* ... */ block comments (single or multi-line, non-greedy).
  const noBlockComments = noLineComments.replace(/\/\*[\s\S]*?\*\//g, '');

  // Pass 3: trailing commas before `}` or `]`.
  return noBlockComments.replace(/,(\s*[}\]])/g, '$1');
}
