# oklch-terminal-themes

Canonical dataset of <!-- theme-count -->633<!-- /theme-count --> terminal color schemes converted to [OKLCH](https://oklch.com/), sourced from [`mbadolato/iTerm2-Color-Schemes`](https://github.com/mbadolato/iTerm2-Color-Schemes) and republished as an npm package + JSON API.

Designed for consumption by Astro sites, theme pickers, Tailwind v4 `@theme` blocks, and any tooling that wants a clean OKLCH palette without parsing iTerm XML or Alacritty TOML.

**Live demo + picker:** https://williamzujkowski.github.io/oklch-terminal-themes/

Browse <!-- theme-count -->633<!-- /theme-count --> themes via a search + filter combobox, preview each theme live across five UI mocks (palette, terminal, IDE, reading view, dashboard), copy the active theme as CSS variables / Tailwind `@theme` / raw JSON, or share a permalink.

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
  tags: string[]; // see "Tags" below
  source: 'iterm2-color-schemes';
  sourceUrl: string; // deep link to upstream file at pinned SHA
  upstreamSha: string;
  updatedAt: string; // ISO 8601
  colors: Record<
    ColorKey,
    { hex: string; oklch: { l: number; c: number; h: number }; oklchCss: string }
  >;
  contrast: {
    fgOnBg: number; // WCAG 2.x body-text ratio (foreground vs background)
    minAnsi: number; // worst non-blend ANSI slot vs background
    minAnsiSlot: ColorKey; // which slot hit `minAnsi`
    cursorOnBg?: number; // cursor vs background (WCAG 1.4.11 non-text pair)
    selectionContrast?: number; // foreground vs selection-background
    brightnessOrdered?: boolean; // true iff every bright* slot is lighter than its normal counterpart
    brightnessViolations?: ColorKey[]; // bright* slot names that fail the above; empty when ordered
  };
  counterpart?: string; // slug of the canonical opposite-polarity pair — see "Counterpart" below
  accent?: {
    // computed/curatable signature color — see "Accent" below
    source: 'cursor' | ColorKey; // 'cursor' or one of the 16 ANSI keys
    hex: string;
    oklch: { l: number; c: number; h: number };
    oklchCss: string;
  };
}
```

20 color keys per theme: `background`, `foreground`, `cursor`, `selection`, and the 16 ANSI slots (`black`...`white`, `brightBlack`...`brightWhite`).

### Counterpart

`counterpart` links a theme to its canonical opposite-polarity pair (e.g. `ayu-light`'s counterpart is `ayu`; `remarque-light`'s counterpart is `remarque-dark`). It's computed at build time from a slug-stem heuristic (`ayu-light` and `ayu` share the stem `ayu`), plus a small curated map for families with more than one light or dark variant (`catppuccin`, `github`, `gruvbox`, `gruvbox-material`, `material`, `rose-pine`, `tokyonight`, `zenbones`).

The field is **directional and not necessarily involutive**: several dark variants in a family may point at one canonical light member, while that light member points back at only its canonical dark. For example, `tokyonight-storm`'s counterpart is `tokyonight-day`, but `tokyonight-day`'s counterpart is the bare `tokyonight`, not `tokyonight-storm`.

`counterpart` is present in `themes.json`, `themes-slim.json`, `index.json`, and each `data/by-name/<slug>.json` record. It's absent (the key is omitted) for themes with no identifiable counterpart. See [#128](https://github.com/williamzujkowski/oklch-terminal-themes/issues/128) for the seeding analysis.

### Accent

`accent` is a theme's computed signature/accent color — the answer to "what is this theme's one defining hue?" It's computed at build time by the same heuristic [remarque-tokens](https://github.com/williamzujkowski/remarque)' theme bridge uses to derive its `--color-accent` token: `cursor` if the cursor color is chromatic (OKLCH chroma >= 0.05), otherwise the most-chromatic of the six classic ANSI colors, in this order — `blue`, `purple`, `red`, `green`, `cyan`, `yellow` — with ties broken by that same order.

The `accent` VALUE is always a **reference** to the chosen slot's own color (the same `hex`/`oklch`/`oklchCss`), never a newly derived color — `scripts/validate.ts` asserts that equality exactly. Across the current dataset the heuristic splits: `cursor` 232, `red` 153, `purple` 92, `green` 28, `blue` 18, `yellow` 16, `cyan` 8.

A small curated override map (`CURATED_ACCENT_OVERRIDES` in `src/accent.ts`, seeded empty) can pin a specific theme's accent to a different slot for the rare case where the heuristic's guess doesn't match the theme's actual identity — same shape as the `counterpart` overrides. See [#133](https://github.com/williamzujkowski/oklch-terminal-themes/issues/133).

`accent` is present in `themes.json` (full `{ source, hex, oklch, oklchCss }`), and trimmed to `{ source, oklchCss }` in `themes-slim.json` and `index.json` — the same lean-index convention as the rest of those files.

### Tags

| Tag                              | Meaning                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dark` / `light`                 | derived from OKLCH background lightness                                                                                          |
| `vibrant` / `muted`              | average OKLCH chroma across all 20 slots                                                                                         |
| `popular`                        | slug matches a well-known family (dracula, nord, solarized, …)                                                                   |
| `wcag-aaa`                       | `contrast.fgOnBg ≥ 7`                                                                                                            |
| `wcag-aa`                        | `contrast.fgOnBg ≥ 4.5`                                                                                                          |
| `wcag-aa-large`                  | `3 ≤ contrast.fgOnBg < 4.5`                                                                                                      |
| `wcag-fail`                      | `contrast.fgOnBg < 3`                                                                                                            |
| `ansi-legible`                   | `contrast.minAnsi ≥ 3` — every non-blend ANSI slot clears AA-large against the background                                        |
| `cursor-visible`                 | `contrast.cursorOnBg ≥ 3.0` — WCAG 1.4.11 Non-text Contrast floor (cursor is a UI element, not text)                             |
| `selection-legible`              | `contrast.selectionContrast ≥ 4.5` — WCAG 1.4.3 AA body-text bar applied to fg-on-selection                                      |
| `brightness-ordered`             | `contrast.brightnessOrdered` — every `bright*` slot is strictly lighter (OKLCH L) than its normal counterpart across all 8 pairs |
| `high-contrast` / `low-contrast` | retained for backwards compatibility with pre-WCAG-tag consumers (`> 10:1` / `< 5:1` respectively)                               |

`minAnsi` excludes the slot(s) that conventionally blend with the background — `black` + `brightBlack` on dark themes, `white` + `brightWhite` on light themes — so intentional near-bg slots don't false-flag otherwise well-formed themes.

`cursor-visible` and `selection-legible` are additive/optional fields (issue #145) — absent on data built before they existed. `cursorOnBg` is the background-vs-cursor WCAG ratio; a cursor is a non-text UI element, so the 3:1 WCAG 1.4.11 floor applies rather than the 4.5:1 body-text bar. `selectionContrast` is foreground-vs-selection-background — the schema carries no dedicated selected-text-color slot, so fg-on-selection is the meaningful "can you still read the text once it's selected?" pair, judged against the same 4.5:1 AA bar as `wcag-aa` since selected text is still text.

`brightness-ordered` catches a real bug class where a theme's `bright*` ANSI slots aren't actually lighter than their normal counterparts (e.g. `brightBlack` darker than `black`) — such themes render worse than authored in terminal emulators that map SGR bold to the bright palette (see microsoft/terminal #12957/#5384, terminator #943). `contrast.brightnessViolations` lists the offending `bright*` slot names; it's empty when `brightnessOrdered` is `true`.

## How it's built

1. **Fetch** — sparse clones of every repo listed in `sources.json`, each pinned to a per-source SHA in `.upstream-shas.json`.
2. **Convert** — hex → OKLCH via [`culori`](https://culorijs.org/). Achromatic hue coerced to `0` (JSON-safe). Lightness clamped `[0, 1]`, chroma `[0, 0.5]`.
3. **Classify** — `isDark` derived from OKLCH lightness; tags from chroma average + WCAG contrast + name heuristics.
4. **Validate** — Zod schema + round-trip ΔE2000 < 1.0 gate + within-source duplicate-slug guard. Cross-source slug collisions resolve via `sources.json` order (first source wins, dropped duplicate logged).
5. **Emit** — `data/themes.json`, `data/themes-slim.json`, `data/index.json`, `data/by-name/<slug>.json`. Every record carries `source` (the source id) and `upstreamSha` for that source.

GitHub Actions re-runs this weekly and opens a PR on upstream diff across all sources.

## Attribution

Color schemes originate from the upstream repositories listed in `sources.json` — currently [iTerm2-Color-Schemes](https://github.com/mbadolato/iTerm2-Color-Schemes) (MIT) and [warm-burnout](https://github.com/felipefdl/warm-burnout) (MIT). Authorship of individual schemes belongs to their upstream authors. See `NOTICE`.

## License

MIT — see `LICENSE`.
