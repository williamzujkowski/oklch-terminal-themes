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
  dataviz?: {
    // derived data-visualization palette — see "Dataviz" below
    categorical: ColorValueEntry[]; // 6-8 colors
    sequential: ColorValueEntry[]; // 7-step background -> accent ramp
    diverging: ColorValueEntry[]; // 7-step accent-hue <-> farthest-hue ramp
  };
  cvd?: {
    // colorblind-safety simulation scores — see "Colorblind safety" below
    deuteranopia: number; // min pairwise ΔE2000 among the 6 classic ANSI hues, post-simulation
    protanopia: number;
    tritanopia: number; // data-only — doesn't gate `cvd-safe`/`cvd-caution`
  };
  apca?: {
    // APCA Lc scores, DATA ONLY — see "APCA" below
    fgOnBg: number; // signed Lc, foreground (text) on background
    minAnsi: number; // signed Lc of the worst-case (smallest |Lc|) non-blend ANSI slot
    minAnsiSlot: ColorKey;
  };
}

// Each dataviz color is a full { hex, oklch, oklchCss } record — the same
// shape as `colors[key]` above.
type ColorValueEntry = {
  hex: string;
  oklch: { l: number; c: number; h: number };
  oklchCss: string;
};
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

### Dataviz

`dataviz` is a theme's derived data-visualization palette — a `categorical` swatch set plus `sequential`/`diverging` ramps, computed at build time as pure functions over `colors` + `accent`. It exists so a downstream consumer (e.g. [remarque](https://github.com/williamzujkowski/remarque)'s syntax-highlighting bridge) doesn't have to re-derive chart-ready colors from a raw ANSI palette itself. See [#150](https://github.com/williamzujkowski/oklch-terminal-themes/issues/150).

- **`categorical`** (6-8 colors) — selected from the theme's 12 chromatic ANSI slots (6 classic + 6 bright; `black`/`white`/`brightBlack`/`brightWhite` excluded as non-chromatic). Near-identical hues (bright variants that are little more than a lightened copy of their normal counterpart, within ~20° of hue) collapse to whichever is more chromatic. Selection then starts from the hue closest to the theme's `accent` and greedily adds the remaining candidate that maximizes its minimum hue-distance to everything already picked — a standard farthest-point / max-min-distance strategy, the same one [IBM Carbon Design System](https://carbondesignsystem.com/data-visualization/color-palettes/) and [Observable Plot](https://observablehq.com/plot/features/scales)'s categorical-palette guidance converge on for "adjacent-distinguishability." Insertion order visits far-apart regions of the hue circle before backfilling nearby gaps, which is why adjacent entries in the final array rarely land on near-complementary (~180° apart) pairs — the failure mode Judith Helfman's writing on categorical color warns produces visual vibration/afterimage artifacts when complementary hues sit directly next to each other. A theme only gets 7 or 8 categorical colors when that many distinct hue clusters actually exist; low-hue-diversity themes correctly settle at the 6-color floor. Each entry is a **reference** to its own ANSI slot's color, same convention as `accent`.
- **`sequential`** (7 steps) — a straight-line OKLCH interpolation from `background` to `accent`: lightness ramps from the background's own value to the accent's, chroma ramps from 0 up to the accent's own chroma, hue is held fixed at the accent's hue throughout (a single-hue ramp reads as one color at increasing intensity, not a rainbow — the Carbon/Observable convention for sequential scales). Index 0 is always background-anchored (lowest emphasis); the last index is always the accent itself (highest emphasis). For a **dark** theme (low background lightness) that plays out dark-to-light; for a **light** theme (high background lightness) it plays out light-to-dark — same "low to high emphasis" semantic in both polarities, just expressed in whichever lightness direction that theme's own background implies. Monotonic in lightness by construction.
- **`diverging`** (7 steps, always odd) — two arms meeting at a near-achromatic midpoint: one arm anchors on the accent's own hue, the other on whichever `categorical` color's hue is farthest (by circular distance) from the accent. Lightness is a single linear ramp across all 7 steps from one arm's endpoint to the other's — the midpoint's lightness is just that ramp evaluated at its center, so the whole array is monotonic in `l`. The divergence itself reads through chroma/hue: each arm's chroma ramps down to a small near-background value (~0.0075) at the midpoint.

Both `sequential` and `diverging` are newly **derived** colors (not references) — gamut-fit at every step (chroma is clamped to what's actually displayable at that step's own lightness/hue _before_ rounding, since the sRGB gamut boundary narrows sharply near black/white and shifts with hue — a naive lightness/chroma interpolation can walk through combinations that are fine at the ramp's endpoints but invalid partway through). `scripts/validate.ts` enforces categorical length (6-8), diverging's odd length, sequential's lightness-monotonicity, and a round-trip ΔE2000 < 1.0 gate on every derived color.

`dataviz` is present in full in `themes.json`; `themes-slim.json` trims it to `{ categorical: string[] }` (just the `oklchCss` strings, mirroring how `accent` gets trimmed there); `index.json` omits it entirely to keep the index lean.

**Worked example** — `dracula`'s accent is `green` (`#50fa7b`, hue 148°); its categorical hex row: `#50fa7b`, `#ff79c6`, `#8be9fd`, `#bd93f9`, `#ff5555`, `#f1fa8c` (6 colors — Dracula's ANSI bright variants dedupe against their normal counterparts, same shape as `remarque-dark`/`remarque-light`, whose categorical instead settles on `blue` since their accent hue is 250°).

### Colorblind safety (cvd)

`cvd` scores how well a theme's 6 classic ANSI hues (`red`, `green`, `yellow`, `blue`, `purple`, `cyan`) stay distinguishable under simulated color-vision deficiency. Computed at build time via [`culori`](https://culorijs.org/)'s `filterDeficiencyDeuter`/`filterDeficiencyProt`/`filterDeficiencyTrit` filters (Machado, Oliveira & Fluck 2009) — never hand-rolled — followed by the minimum pairwise [CIEDE2000](https://culorijs.org/api/#differenceCiede2000) ΔE among the 6 simulated colors, the same ΔE metric family this package already uses for its round-trip validation gate. See [#149](https://github.com/williamzujkowski/oklch-terminal-themes/issues/149).

```ts
cvd: {
  deuteranopia: number; // min pairwise ΔE2000, post deuteranopia simulation
  protanopia: number; // min pairwise ΔE2000, post protanopia simulation
  tritanopia: number; // data-only — doesn't gate the tag (see below)
}
```

Higher is better — a low score means at least two of the theme's 6 signal colors become hard to tell apart under that deficiency (the "is this a git-diff addition or deletion?" failure mode). The `cvd-safe` tag requires **both** `deuteranopia` and `protanopia` >= `10` (CIEDE2000 units); anything below either bar is tagged `cvd-caution` instead. `tritanopia` (blue-yellow deficiency, far rarer than red-green) is reported for free but doesn't gate either tag.

The `10` threshold is deliberately conservative and validated against known references: the Okabe-Ito-derived `wong-colorblind-safe-dark`/`wong-colorblind-safe-light` native themes both clear it comfortably on every axis (as they must — they're the textbook "designed to be CVD-safe" palette). Across the full corpus, most themes are decorative community palettes never designed with CVD safety in mind, so only a small minority clear the bar — see the current corpus split in the build log / CHANGELOG rather than treating a low pass rate as a bug.

### APCA

`apca` adds [APCA](https://github.com/Myndex/apca-w3) (Accessible Perceptual Contrast Algorithm) Lc scores alongside the WCAG 2.x `contrast` block, computed via the `apca-w3` reference implementation — **data only**: nothing in this package tags or gates on these values, the `wcag-*`/`ansi-legible` tags remain driven entirely by `contrast`. See [#151](https://github.com/williamzujkowski/oklch-terminal-themes/issues/151).

```ts
apca: {
  fgOnBg: number; // signed Lc, foreground (text) on background
  minAnsi: number; // signed Lc of the worst-case non-blend ANSI slot vs background
  minAnsiSlot: ColorKey; // which slot hit minAnsi
}
```

Lc ranges roughly ±108 and is **polarity-aware**, unlike WCAG2's symmetric ratio: positive Lc means the text color is darker than the background, negative means it's lighter — the sign matters, not just the magnitude. As a rough guide, `|Lc| >= 60` is APCA's approximate analogue of WCAG's 4.5:1 body-text guidance (contexts differ — see the [APCA docs](https://github.com/Myndex/apca-w3) for the full font-size/weight lookup table this package doesn't attempt to replicate).

Why add a second contrast metric at all? WCAG 2.x's relative-luminance math is well documented to overstate contrast in the low-luminance ranges where most dark terminal themes live. A concrete example from this corpus: `github-dark` passes `wcag-aa` (6.10:1) comfortably, but its APCA `fgOnBg` is only -43.5 — well short of the ~60 body-text guidance. APCA is still evolving outside the W3C standards process, which is exactly why it stays data, not policy, here.

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
| `cvd-safe` / `cvd-caution`       | `cvd.deuteranopia` AND `cvd.protanopia` both `≥ 10` (CIEDE2000, post-simulation) — see "Colorblind safety" above                 |

`minAnsi` excludes the slot(s) that conventionally blend with the background — `black` + `brightBlack` on dark themes, `white` + `brightWhite` on light themes — so intentional near-bg slots don't false-flag otherwise well-formed themes.

`cursor-visible` and `selection-legible` are additive/optional fields (issue #145) — absent on data built before they existed. `cursorOnBg` is the background-vs-cursor WCAG ratio; a cursor is a non-text UI element, so the 3:1 WCAG 1.4.11 floor applies rather than the 4.5:1 body-text bar. `selectionContrast` is foreground-vs-selection-background — the schema carries no dedicated selected-text-color slot, so fg-on-selection is the meaningful "can you still read the text once it's selected?" pair, judged against the same 4.5:1 AA bar as `wcag-aa` since selected text is still text.

`brightness-ordered` catches a real bug class where a theme's `bright*` ANSI slots aren't actually lighter than their normal counterparts (e.g. `brightBlack` darker than `black`) — such themes render worse than authored in terminal emulators that map SGR bold to the bright palette (see microsoft/terminal #12957/#5384, terminator #943). `contrast.brightnessViolations` lists the offending `bright*` slot names; it's empty when `brightnessOrdered` is `true`.

## How it's built

1. **Fetch** — sparse clones of every repo listed in `sources.json`, each pinned to a per-source SHA in `.upstream-shas.json`.
2. **Convert** — hex → OKLCH via [`culori`](https://culorijs.org/). Achromatic hue coerced to `0` (JSON-safe). Lightness clamped `[0, 1]`, chroma `[0, 0.5]`.
3. **Classify** — `isDark` derived from OKLCH lightness; tags from chroma average + WCAG contrast + name heuristics; `cvd` (colorblind-safety simulation scores) and `apca` (APCA Lc scores, data only) computed alongside.
4. **Validate** — Zod schema + round-trip ΔE2000 < 1.0 gate + within-source duplicate-slug guard. Cross-source slug collisions resolve via `sources.json` order (first source wins, dropped duplicate logged).
5. **Emit** — `data/themes.json`, `data/themes-slim.json`, `data/index.json`, `data/by-name/<slug>.json`. Every record carries `source` (the source id) and `upstreamSha` for that source.

GitHub Actions re-runs this weekly and opens a PR on upstream diff across all sources.

## Attribution

Color schemes originate from the upstream repositories listed in `sources.json` — currently [iTerm2-Color-Schemes](https://github.com/mbadolato/iTerm2-Color-Schemes) (MIT) and [warm-burnout](https://github.com/felipefdl/warm-burnout) (MIT). Authorship of individual schemes belongs to their upstream authors. See `NOTICE`.

## License

MIT — see `LICENSE`.
