import type { SourceFormat } from '../sources.js';
import type { UpstreamScheme } from '../schema.js';
import { parseWindowsTerminalJson } from './windowsterminal.js';
import { parseWindowsTerminalJsonc } from './jsonc.js';
import { parseGhostty } from './ghostty.js';
import { parseWarpYaml } from './warp.js';

/**
 * Each format's parser takes the raw file content + a fallback name (derived
 * from the filename) and returns the canonical mbadolato/Windows-Terminal
 * shape after a Zod-validated boundary check. Parsers throw on parse errors
 * so the build fails loudly — silent drops are forbidden by §11.2 of
 * CODING_STANDARDS.
 */
export type ParserFn = (content: string, nameFromFilename: string) => UpstreamScheme;

const PARSERS: Record<SourceFormat, ParserFn> = {
  'windowsterminal-json': (content) => parseWindowsTerminalJson(content),
  'windowsterminal-jsonc': (content) => parseWindowsTerminalJsonc(content),
  ghostty: (content, name) => parseGhostty(content, name),
  'warp-yaml': (content, name) => parseWarpYaml(content, name),
};

const FORMAT_EXTENSIONS: Record<SourceFormat, string> = {
  'windowsterminal-json': '.json',
  'windowsterminal-jsonc': '.jsonc',
  ghostty: '',
  'warp-yaml': '.yaml',
};

export function parserFor(format: SourceFormat): ParserFn {
  return PARSERS[format];
}

export function defaultExtensionFor(format: SourceFormat): string {
  return FORMAT_EXTENSIONS[format];
}
