# oklch-terminal-themes

Canonical dataset of 485 terminal color schemes converted to [OKLCH](https://oklch.com/), sourced from [`mbadolato/iTerm2-Color-Schemes`](https://github.com/mbadolato/iTerm2-Color-Schemes) and republished as an npm package + JSON API.

Designed for consumption by Astro sites, theme pickers, Tailwind v4 `@theme` blocks, and any tooling that wants a clean OKLCH palette without parsing iTerm XML or Alacritty TOML.

**Live demo + picker:** https://williamzujkowski.github.io/oklch-terminal-themes/

Browse all 485 themes, filter by tag, preview on a terminal mock + website mock, copy as CSS variables / Tailwind `@theme` / raw JSON, or compare two themes side-by-side.

## Install

```bash
pnpm add @williamzujkowski/oklch-terminal-themes
```

## Usage

### Full dataset (server-side / build-time)

```ts
import themes from '@williamzujkowski/oklch-terminal-themes/themes.json';

const dark = themes.filter((t) => t.isDark);
console.log(dark[0].colors.background.oklchCss);
// -> "oklch(0.231 0.016 264.1)"
```

### Slim dataset (client-side / theme picker)

```ts
import themes from '@williamzujkowski/oklch-terminal-themes/themes-slim.json';
// Each color is a ready-to-paste oklch() CSS string.
```

### Index only (lazy-load individual themes)

```ts
import index from '@williamzujkowski/oklch-terminal-themes/index.json';

async function loadTheme(slug: string) {
  return (await import(`@williamzujkowski/oklch-terminal-themes/themes/${slug}.json`)).default;
}
```

### CSS custom properties

```ts
import { themeToCssVars } from '@williamzujkowski/oklch-terminal-themes';
import dracula from '@williamzujkowski/oklch-terminal-themes/themes/dracula.json';

const css = `:root {\n${themeToCssVars(dracula)}\n}`;
```

### Tailwind v4

```css
@import 'tailwindcss';
@import '@williamzujkowski/oklch-terminal-themes/themes/dracula.json' as json;

@theme {
  --color-terminal-bg: var(--terminal-background);
  --color-terminal-fg: var(--terminal-foreground);
}
```

## Schema

Each theme record:

```ts
interface TerminalColorTheme {
  name: string; // "Dracula"
  slug: string; // "dracula"
  isDark: boolean;
  tags: string[]; // "dark" | "light" | "vibrant" | "muted" | "high-contrast" | "low-contrast" | "popular"
  source: 'iterm2-color-schemes';
  sourceUrl: string; // deep link to upstream file at pinned SHA
  upstreamSha: string;
  updatedAt: string; // ISO 8601
  colors: Record<
    ColorKey,
    { hex: string; oklch: { l: number; c: number; h: number }; oklchCss: string }
  >;
}
```

20 color keys per theme: `background`, `foreground`, `cursor`, `selection`, and the 16 ANSI slots (`black`...`white`, `brightBlack`...`brightWhite`).

## How it's built

1. **Fetch** — sparse clone of upstream `windowsterminal/` at a pinned SHA (`.upstream-sha`).
2. **Convert** — hex → OKLCH via [`culori`](https://culorijs.org/). Achromatic hue coerced to `0` (JSON-safe). Lightness clamped `[0, 1]`, chroma `[0, 0.5]`.
3. **Classify** — `isDark` derived from OKLCH lightness; tags from chroma average + WCAG contrast + name heuristics.
4. **Validate** — Zod schema + round-trip ΔE2000 < 1.0 gate + duplicate-slug guard.
5. **Emit** — `data/themes.json`, `data/themes-slim.json`, `data/index.json`, `data/by-name/<slug>.json`.

GitHub Actions re-runs this weekly and opens a PR on upstream diff.

## Attribution

All color schemes originate from [iTerm2-Color-Schemes](https://github.com/mbadolato/iTerm2-Color-Schemes) (MIT). Authorship of individual schemes belongs to their upstream authors. See `NOTICE`.

## License

MIT — see `LICENSE`.
