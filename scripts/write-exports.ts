// Writes the static export artifacts (issues #146, #147) for every theme:
// base16/base24 scheme YAML + static per-theme CSS. Split out of
// `scripts/build.ts`'s `main` to keep that function under the repo's
// complexity/line-count ESLint budget — pure IO orchestration over the pure
// functions in `src/schemes.ts` / `src/css-export.ts`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBase16Yaml, buildBase24Yaml } from '../src/schemes.js';
import { themeToCssFile } from '../src/css-export.js';
import type { SourceConfig } from '../src/sources.js';
import type { TerminalColorTheme } from '../src/types.js';

export function writeExportArtifacts(
  themes: readonly TerminalColorTheme[],
  sources: readonly SourceConfig[],
  dataDir: string,
): void {
  const schemesBase16Dir = join(dataDir, 'schemes', 'base16');
  const schemesBase24Dir = join(dataDir, 'schemes', 'base24');
  const cssDir = join(dataDir, 'css');
  mkdirSync(schemesBase16Dir, { recursive: true });
  mkdirSync(schemesBase24Dir, { recursive: true });
  mkdirSync(cssDir, { recursive: true });

  const sourceNameById = new Map(sources.map((s) => [s.id, s.name]));
  for (const theme of themes) {
    const author = `${sourceNameById.get(theme.source) ?? theme.source} (via oklch-terminal-themes)`;
    const schemeInput = { name: theme.name, isDark: theme.isDark, author, colors: theme.colors };
    writeFileSync(join(schemesBase16Dir, `${theme.slug}.yaml`), buildBase16Yaml(schemeInput));
    writeFileSync(join(schemesBase24Dir, `${theme.slug}.yaml`), buildBase24Yaml(schemeInput));
    writeFileSync(join(cssDir, `${theme.slug}.css`), themeToCssFile(theme));
  }
}
