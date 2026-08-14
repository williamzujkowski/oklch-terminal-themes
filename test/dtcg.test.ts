import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDtcgJson, colorToToken, dtcgCoveredKeys, themeToDtcg } from '../src/dtcg.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorValue, TerminalColorTheme } from '../src/types.js';

const dracula = JSON.parse(
  readFileSync(new URL('../data/by-name/dracula.json', import.meta.url), 'utf-8'),
) as TerminalColorTheme;

const themes = JSON.parse(
  readFileSync(new URL('../data/themes.json', import.meta.url), 'utf-8'),
) as TerminalColorTheme[];

function colorValue(l: number, c: number, h: number, hex = '#123456'): ColorValue {
  return { hex, oklch: { l, c, h }, oklchCss: `oklch(${String(l)} ${String(c)} ${String(h)})` };
}

/** Walks every `$value` in the document, with its dotted path. */
function tokens(node: unknown, path: string[] = []): { path: string; value: unknown }[] {
  if (typeof node !== 'object' || node === null) return [];
  const obj = node as Record<string, unknown>;
  if ('$value' in obj) return [{ path: path.join('.'), value: obj.$value }];
  return Object.entries(obj)
    .filter(([k]) => !k.startsWith('$'))
    .flatMap(([k, v]) => tokens(v, [...path, k]));
}

describe('dtcg: the key partition is exhaustive', () => {
  // The export hand-maintains UI_KEYS + ANSI_BASE x2 as a partition of
  // COLOR_KEYS. Adding a slot to the dataset without adding it here would
  // silently drop it from every emitted file, which no other test would see.
  it('covers every ColorKey exactly once', () => {
    const covered = dtcgCoveredKeys();
    expect([...covered].sort()).toEqual([...COLOR_KEYS].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('emits exactly one token per ColorKey', () => {
    expect(tokens(themeToDtcg(dracula))).toHaveLength(COLOR_KEYS.length);
  });
});

describe('dtcg: the 2025.10 stable colour shape', () => {
  it('uses the structured colour object with oklch components', () => {
    const doc = themeToDtcg(dracula) as { color: Record<string, { $value: unknown }> };
    expect(doc.color.background?.$value).toEqual({
      colorSpace: 'oklch',
      components: [0.2882, 0.0221, 277.5],
      alpha: 1,
      hex: '#282a36',
    });
  });

  it('declares $type once on the group, not on each leaf', () => {
    const doc = themeToDtcg(dracula) as { color: Record<string, unknown> };
    expect(doc.color.$type).toBe('color');
    // Group inheritance is the point; repeating it on 20 leaves would be
    // valid but is exactly the noise the stable spec's inheritance avoids.
    for (const { value } of tokens(doc)) {
      expect(value).not.toHaveProperty('$type');
    }
  });

  it('nests the ANSI block as normal/bright halves', () => {
    const paths = tokens(themeToDtcg(dracula)).map((t) => t.path);
    expect(paths).toContain('color.ansi.normal.red');
    expect(paths).toContain('color.ansi.bright.red');
    expect(paths).toContain('color.foreground');
  });

  it('puts theme metadata under $extensions, never as loose tokens', () => {
    const doc = themeToDtcg(dracula) as Record<string, unknown>;
    // A non-`$` property at the root would be read as a token or group by any
    // conformant parser, so `slug`/`tags` must not appear there.
    expect(Object.keys(doc).filter((k) => !k.startsWith('$'))).toEqual(['color']);
    const ext = doc.$extensions as Record<string, { slug: string }>;
    expect(ext['dev.oklch-terminal-themes']?.slug).toBe('dracula');
  });

  it('does not encode multi-mode pairing, which is still a draft', () => {
    const json = buildDtcgJson(dracula);
    // `counterpart` may be surfaced as metadata, but no `$modes`/`$sets`
    // draft key may appear anywhere in the document.
    for (const draftKey of ['$modes', '$sets', '$resolver', '$context']) {
      expect(json).not.toContain(draftKey);
    }
  });
});

describe('dtcg: powerless hue', () => {
  it('emits "none" for hue when chroma is exactly 0', () => {
    expect(colorToToken(colorValue(0.5, 0, 0)).$value.components).toEqual([0.5, 0, 'none']);
  });

  it('keeps a numeric hue as soon as there is any chroma', () => {
    expect(colorToToken(colorValue(0.5, 0.0001, 12.3)).$value.components).toEqual([
      0.5, 0.0001, 12.3,
    ]);
  });

  it('always carries hex, so a hex-only consumer never needs the components', () => {
    const grey = colorToToken(colorValue(0.5, 0, 0, '#808080'));
    expect(grey.$value.hex).toBe('#808080');
  });
});

describe('dtcg: the whole corpus emits valid documents', () => {
  it('produces parseable JSON with the full token set for every theme', () => {
    // Cheap over 644 themes, and it is the only check that would catch a
    // theme whose colours are structurally odd rather than merely unusual.
    let checked = 0;
    for (const theme of themes) {
      const doc = JSON.parse(buildDtcgJson(theme)) as unknown;
      expect(tokens(doc), theme.slug).toHaveLength(COLOR_KEYS.length);
      checked++;
    }
    expect(checked).toBe(themes.length);
  });

  it('emits components within the ranges the colour space allows', () => {
    for (const theme of themes) {
      for (const { path, value } of tokens(themeToDtcg(theme))) {
        const { components } = value as { components: (number | 'none')[] };
        const [l, c, h] = components;
        expect(typeof l === 'number' && l >= 0 && l <= 1, `${theme.slug} ${path} L`).toBe(true);
        expect(typeof c === 'number' && c >= 0, `${theme.slug} ${path} C`).toBe(true);
        expect(h === 'none' || (h >= 0 && h < 360), `${theme.slug} ${path} H`).toBe(true);
      }
    }
  });

  it('round-trips the hex fallback exactly, never a reconverted value', () => {
    // The hex is copied from the source, not recomputed from OKLCH — a
    // reconversion would drift by up to the round-trip delta and silently
    // make these files disagree with every other export.
    for (const theme of themes.slice(0, 50)) {
      const doc = themeToDtcg(theme);
      for (const { path, value } of tokens(doc)) {
        const key = path.split('.').pop() ?? '';
        const { hex } = value as { hex: string };
        const isBright = path.includes('.bright.');
        const colorKey = isBright ? `bright${key.charAt(0).toUpperCase()}${key.slice(1)}` : key;
        expect(hex, `${theme.slug} ${path}`).toBe(
          theme.colors[colorKey as keyof typeof theme.colors].hex,
        );
      }
    }
  });
});
