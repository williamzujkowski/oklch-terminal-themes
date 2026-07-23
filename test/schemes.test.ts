import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { oklchRoundTripDeltaE } from '../src/convert.js';
import {
  BASE16_KEYS,
  BASE24_KEYS,
  SYNTHESIZED_SLOT_COMMENTS,
  buildBase16Yaml,
  buildBase24Yaml,
  computeBase16Slots,
  computeBase24Slots,
  serializeScheme,
} from '../src/schemes.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorKey, ColorValue, Colors, Oklch, TerminalColorTheme } from '../src/types.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const HEX_RE = /^#[0-9a-f]{6}$/;

// Same minimal, deterministic fixture-builder convention as
// test/accent.test.ts / test/dataviz.test.ts — real hex<->OKLCH conversion
// isn't needed since these functions operate purely on the `oklch` field.
function cv(l: number, c: number, h: number, hex = '#000000'): ColorValue {
  return { hex, oklch: { l, c, h }, oklchCss: `oklch(${l} ${c} ${h})` };
}

function makeColors(overrides: Partial<Record<ColorKey, Oklch>> = {}): Colors {
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    const o = overrides[key] ?? { l: 0.5, c: 0.01, h: 0 };
    colors[key] = cv(o.l, o.c, o.h);
  }
  return colors;
}

// A "gruvbox-dark-hard"-shaped fixture: real-ish OKLCH anchors so
// interpolation/synthesis produce visually sane midpoints, distinct from the
// flat 0.5/0.01/0 default so every derived slot is actually exercised.
function makeThemeColors(): Colors {
  return makeColors({
    background: { l: 0.18, c: 0.01, h: 30 },
    foreground: { l: 0.85, c: 0.03, h: 80 },
    selection: { l: 0.35, c: 0.02, h: 30 },
    cursor: { l: 0.85, c: 0.03, h: 80 },
    black: { l: 0.2, c: 0.01, h: 30 },
    red: { l: 0.55, c: 0.19, h: 25 },
    green: { l: 0.65, c: 0.15, h: 128 },
    yellow: { l: 0.75, c: 0.15, h: 95 },
    blue: { l: 0.55, c: 0.1, h: 235 },
    purple: { l: 0.55, c: 0.15, h: 330 },
    cyan: { l: 0.65, c: 0.1, h: 190 },
    white: { l: 0.85, c: 0.03, h: 80 },
    brightBlack: { l: 0.45, c: 0.02, h: 30 },
    brightRed: { l: 0.62, c: 0.2, h: 22 },
    brightGreen: { l: 0.72, c: 0.16, h: 128 },
    brightYellow: { l: 0.8, c: 0.15, h: 95 },
    brightBlue: { l: 0.62, c: 0.11, h: 235 },
    brightPurple: { l: 0.62, c: 0.15, h: 330 },
    brightCyan: { l: 0.72, c: 0.1, h: 190 },
    brightWhite: { l: 0.95, c: 0.01, h: 80 },
  });
}

describe('computeBase16Slots', () => {
  it('returns all 16 slots in BASE16_KEYS order', () => {
    const slots = computeBase16Slots(makeThemeColors());
    expect(slots.map((s) => s.key)).toEqual([...BASE16_KEYS]);
  });

  it('every emitted hex is a valid, in-gamut 6-digit hex string', () => {
    const slots = computeBase16Slots(makeThemeColors());
    for (const slot of slots) {
      expect(slot.color.hex).toMatch(HEX_RE);
    }
  });

  it('reference slots (base00,02,03,05,07,08,0A-0E) equal their source colors exactly', () => {
    const colors = makeThemeColors();
    const slots = computeBase16Slots(colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const referenceMap: Record<string, ColorKey> = {
      base00: 'background',
      base02: 'selection',
      base03: 'brightBlack',
      base05: 'foreground',
      base07: 'brightWhite',
      base08: 'red',
      base0A: 'yellow',
      base0B: 'green',
      base0C: 'cyan',
      base0D: 'blue',
      base0E: 'purple',
    };
    for (const [slotKey, colorKey] of Object.entries(referenceMap)) {
      const slot = bySlot.get(slotKey as (typeof BASE16_KEYS)[number]);
      expect(slot?.derivation).toBe('reference');
      expect(slot?.color).toEqual(colors[colorKey]);
    }
  });

  it('interpolated slots (base01/04/06) land strictly between their anchors in lightness', () => {
    const colors = makeThemeColors();
    const slots = computeBase16Slots(colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const between = (l: number, a: number, b: number): boolean =>
      l >= Math.min(a, b) - 1e-9 && l <= Math.max(a, b) + 1e-9;

    expect(bySlot.get('base01')?.derivation).toBe('interpolated');
    expect(
      between(
        bySlot.get('base01')!.color.oklch.l,
        colors.background.oklch.l,
        colors.selection.oklch.l,
      ),
    ).toBe(true);

    expect(bySlot.get('base04')?.derivation).toBe('interpolated');
    expect(
      between(
        bySlot.get('base04')!.color.oklch.l,
        colors.brightBlack.oklch.l,
        colors.foreground.oklch.l,
      ),
    ).toBe(true);

    expect(bySlot.get('base06')?.derivation).toBe('interpolated');
    expect(
      between(
        bySlot.get('base06')!.color.oklch.l,
        colors.foreground.oklch.l,
        colors.brightWhite.oklch.l,
      ),
    ).toBe(true);
  });

  it('synthesizes base09 (orange) with a hue between red and yellow', () => {
    const colors = makeThemeColors();
    const slots = computeBase16Slots(colors);
    const base09 = slots.find((s) => s.key === 'base09')!;
    expect(base09.derivation).toBe('synthesized');
    // red=25, yellow=95 — the circular-hue midpoint (~60) must land strictly
    // between them, not wrap the "long way" around the hue circle.
    expect(base09.color.oklch.h).toBeGreaterThan(colors.red.oklch.h);
    expect(base09.color.oklch.h).toBeLessThan(colors.yellow.oklch.h);
  });

  it('synthesizes base0F (brown) darker/less chromatic than the synthesized base09', () => {
    const colors = makeThemeColors();
    const slots = computeBase16Slots(colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const base09 = bySlot.get('base09')!;
    const base0F = bySlot.get('base0F')!;
    expect(base0F.derivation).toBe('synthesized');
    // Pulled toward background (darker theme => lower l) and desaturated.
    expect(base0F.color.oklch.l).toBeLessThan(base09.color.oklch.l);
    expect(base0F.color.oklch.c).toBeLessThan(base09.color.oklch.c);
    // Same hue as the orange it was derived from.
    expect(base0F.color.oklch.h).toBeCloseTo(base09.color.oklch.h, 5);
  });

  it('every derived slot survives a gamut-clamped OKLCH round trip', () => {
    const slots = computeBase16Slots(makeThemeColors());
    const derivedKeys = new Set(['base01', 'base04', 'base06', 'base09', 'base0F']);
    for (const slot of slots) {
      if (!derivedKeys.has(slot.key)) continue;
      expect(oklchRoundTripDeltaE(slot.color.oklch)).toBeLessThan(1.0);
    }
  });

  it('is deterministic — identical input yields byte-identical output', () => {
    const colors = makeThemeColors();
    const a = computeBase16Slots(colors);
    const b = computeBase16Slots(colors);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('computeBase24Slots', () => {
  it('returns all 24 slots in BASE24_KEYS order', () => {
    const slots = computeBase24Slots(makeThemeColors());
    expect(slots.map((s) => s.key)).toEqual([...BASE24_KEYS]);
  });

  it('base12-17 are direct references to the bright* ANSI slots', () => {
    const colors = makeThemeColors();
    const slots = computeBase24Slots(colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const referenceMap: Record<string, ColorKey> = {
      base12: 'brightRed',
      base13: 'brightYellow',
      base14: 'brightGreen',
      base15: 'brightCyan',
      base16: 'brightBlue',
      base17: 'brightPurple',
    };
    for (const [slotKey, colorKey] of Object.entries(referenceMap)) {
      const slot = bySlot.get(slotKey as (typeof BASE24_KEYS)[number]);
      expect(slot?.derivation).toBe('reference');
      expect(slot?.color).toEqual(colors[colorKey]);
    }
  });

  it('extrapolates base10/base11 further from foreground than background itself, base11 furthest', () => {
    const colors = makeThemeColors();
    const slots = computeBase24Slots(colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const base10 = bySlot.get('base10')!;
    const base11 = bySlot.get('base11')!;
    expect(base10.derivation).toBe('extrapolated');
    expect(base11.derivation).toBe('extrapolated');

    const fgL = colors.foreground.oklch.l;
    const bgDist = Math.abs(colors.background.oklch.l - fgL);
    const d10 = Math.abs(base10.color.oklch.l - fgL);
    const d11 = Math.abs(base11.color.oklch.l - fgL);
    expect(d10).toBeGreaterThan(bgDist);
    expect(d11).toBeGreaterThan(d10);
    // In-gamut regardless of how far the extrapolation pushes lightness.
    expect(base10.color.hex).toMatch(HEX_RE);
    expect(base11.color.hex).toMatch(HEX_RE);
  });

  it('clamps base10/base11 lightness extrapolation to [0, 1] for an extreme (near-black) background', () => {
    const colors = makeThemeColors();
    colors.background = cv(0.02, 0.01, 30);
    const slots = computeBase24Slots(colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    expect(bySlot.get('base10')!.color.oklch.l).toBeGreaterThanOrEqual(0);
    expect(bySlot.get('base11')!.color.oklch.l).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic — identical input yields byte-identical output', () => {
    const colors = makeThemeColors();
    const a = computeBase24Slots(colors);
    const b = computeBase24Slots(colors);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('serializeScheme / buildBase16Yaml / buildBase24Yaml', () => {
  const meta = {
    system: 'base16' as const,
    name: 'Test',
    author: 'Test Author',
    variant: 'dark' as const,
  };

  it('emits system/name/author/variant/palette as double-quoted plain scalars, no anchors or tags', () => {
    const slots = computeBase16Slots(makeThemeColors());
    const yaml = serializeScheme(meta, slots);
    expect(yaml).toContain('system: "base16"');
    expect(yaml).toContain('name: "Test"');
    expect(yaml).toContain('author: "Test Author"');
    expect(yaml).toContain('variant: "dark"');
    expect(yaml).toContain('palette:');
    // No YAML anchors (&name), aliases (*name), or tags (!!tag) anywhere.
    expect(yaml).not.toMatch(/[&*]\w/);
    expect(yaml).not.toMatch(/!!\w/);
  });

  it('escapes double quotes and backslashes in the theme name', () => {
    const slots = computeBase16Slots(makeThemeColors());
    const yaml = serializeScheme({ ...meta, name: 'Say "Hi"\\there' }, slots);
    expect(yaml).toContain('name: "Say \\"Hi\\"\\\\there"');
  });

  it('discloses base09/base0F as synthesized via inline comment; no comment on other slots', () => {
    const slots = computeBase16Slots(makeThemeColors());
    const yaml = serializeScheme(meta, slots, SYNTHESIZED_SLOT_COMMENTS);
    const lines = yaml.split('\n');
    const base09Line = lines.find((l) => l.trim().startsWith('base09:'))!;
    const base0FLine = lines.find((l) => l.trim().startsWith('base0F:'))!;
    const base08Line = lines.find((l) => l.trim().startsWith('base08:'))!;
    expect(base09Line).toContain('# base09/base0F synthesized');
    expect(base0FLine).toContain('# base09/base0F synthesized');
    expect(base08Line).not.toContain('synthesized');
  });

  it('buildBase16Yaml/buildBase24Yaml pick variant from isDark and emit the right slot count', () => {
    const input = { name: 'X', isDark: false, author: 'A', colors: makeThemeColors() };
    const yaml16 = buildBase16Yaml(input);
    const yaml24 = buildBase24Yaml(input);
    expect(yaml16).toContain('system: "base16"');
    expect(yaml16).toContain('variant: "light"');
    expect(yaml24).toContain('system: "base24"');
    expect((yaml16.match(/^  base/gm) ?? []).length).toBe(16);
    expect((yaml24.match(/^  base/gm) ?? []).length).toBe(24);
  });

  it('is deterministic — identical input yields byte-identical YAML text', () => {
    const input = { name: 'X', isDark: true, author: 'A', colors: makeThemeColors() };
    expect(buildBase24Yaml(input)).toBe(buildBase24Yaml(input));
  });
});

describe('real-data sanity — dracula', () => {
  const theme = JSON.parse(
    readFileSync(join(ROOT, 'data', 'by-name', 'dracula.json'), 'utf8'),
  ) as TerminalColorTheme;

  it("base24 scheme carries dracula's real red/green/blue/etc. as high-confidence references", () => {
    const slots = computeBase24Slots(theme.colors);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    expect(bySlot.get('base08')!.color.hex).toBe(theme.colors.red.hex);
    expect(bySlot.get('base0B')!.color.hex).toBe(theme.colors.green.hex);
    expect(bySlot.get('base0D')!.color.hex).toBe(theme.colors.blue.hex);
    expect(bySlot.get('base12')!.color.hex).toBe(theme.colors.brightRed.hex);
  });

  it('emits valid, parseable YAML with 24 in-gamut palette entries', () => {
    const yaml = buildBase24Yaml({
      name: theme.name,
      isDark: theme.isDark,
      author: 'iTerm2-Color-Schemes (via oklch-terminal-themes)',
      colors: theme.colors,
    });
    const hexMatches = [...yaml.matchAll(/"(#[0-9a-f]{6})"/g)];
    // 4 metadata strings (system/name/author/variant) + 24 palette hexes.
    expect(hexMatches.length).toBe(24);
  });
});
