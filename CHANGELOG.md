# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — `accent` signature-color metadata

Optional `accent` field on every theme record, `themes.json`, `themes-slim.json`, and `index.json` entry (closes #133). Computed at build time by the same cursor-if-chromatic-else-most-chromatic-ANSI heuristic remarque-tokens' theme bridge (`scripts/theme.mjs`, `accentHue()`) already used at derivation time — `cursor` when its OKLCH chroma is >= 0.05, else the most-chromatic of `blue`/`purple`/`red`/`green`/`cyan`/`yellow`, ties broken by that order. `accent` is a REFERENCE to the chosen slot's own `hex`/`oklch`/`oklchCss` (never a newly derived color); `scripts/validate.ts` (`findAccentErrors`) asserts that equality exactly, and that `accent.source` is `cursor` or one of the 16 ANSI keys. `src/accent.ts` also carries `CURATED_ACCENT_OVERRIDES` — a curated per-theme override map (seeded empty) for the rare heuristic miss, same shape as `CURATED_COUNTERPART_OVERRIDES`. Trimmed to `{ source, oklchCss }` in `themes-slim.json` / `index.json`. Corpus split: `cursor` 232, `red` 153, `purple` 92, `green` 28, `blue` 18, `yellow` 16, `cyan` 8 (of 547 themes).

### Added — OKLCH-authored native theme sources

Native theme sources (`data-sources/native/*.json`) may now author each color
slot as either hex (unchanged today-format) or OKLCH — an `oklch(L C H)` CSS
string or an `{l, c, h}` object (closes #132). For OKLCH-authored slots, `hex`
becomes the DERIVED field (gamut-clamped via culori's `clampChroma` before
conversion) while `oklch`/`oklchCss` carry the authored numbers verbatim,
never re-derived from the resulting hex. Upstream-fetched sources are
unaffected — they stay hex-only.

- **`SourceConfigSchema.nativeAuthoring`** — when `true`, `scripts/build.ts`
  routes the source through the new `src/parsers/native.ts` +
  `resolveNativeColor` path instead of the generic hex-only
  `UpstreamSchemeSchema` path. Set on the `native` source only.
- **`TerminalColorTheme.oklchAuthored`** — new optional, additive-only field
  listing which color keys were OKLCH-authored. Absent for every theme built
  before this field existed and every hex-only theme; threads provenance from
  the build into `scripts/validate.ts`.
- **`scripts/validate.ts`** ΔE2000 round-trip check inverts direction for
  OKLCH-authored slots (authored oklch → derived hex → oklch), same ΔE < 1.0
  threshold, unchanged for hex-authored slots.
- **`src/schema.ts`** — `NativeSchemeSchema` / `NativeColorInputSchema` /
  `NativeOklchCssSchema` validate native source files at the ingest boundary;
  an invalid OKLCH value (e.g. `l > 1`, a non-numeric component) fails loudly
  rather than being silently clamped.
- **`src/convert.ts`** — `convertOklchToColor`, `parseOklchCss`,
  `resolveNativeColor`, `oklchRoundTripDeltaE`.
- **`remarque-light` / `remarque-dark`** re-authored in OKLCH using the exact
  [remarque-tokens](https://github.com/williamzujkowski/remarque) design
  values for the 4 anchor slots, and the previously hex-derived OKLCH
  equivalents (verbatim, un-redesigned) for the 16 ANSI slots. Both themes
  retain their `wcag-aaa` + `ansi-legible` tags and `isDark` polarity; every
  derived hex is byte-identical to the prior hex-authored value.

| Slot                  | Theme | Before (hex→oklch, quantized) | After (authored, exact) |
| --------------------- | ----- | ----------------------------- | ----------------------- |
| `background`          | Light | `oklch(0.974 0.005 78.3)`     | `oklch(0.975 0.005 80)` |
| `foreground`          | Light | `oklch(0.18 0.009 75)`        | `oklch(0.18 0.01 80)`   |
| `cursorColor`         | Light | `oklch(0.499 0.141 250.3)`    | `oklch(0.5 0.14 250)`   |
| `selectionBackground` | Light | `oklch(0.919 0.04 250.6)`     | `oklch(0.92 0.04 250)`  |
| `background`          | Dark  | `oklch(0.161 0.01 75.1)`      | `oklch(0.16 0.01 80)`   |
| `foreground`          | Dark  | `oklch(0.901 0.006 84.6)`     | `oklch(0.9 0.005 80)`   |
| `cursorColor`         | Dark  | `oklch(0.68 0.119 250)`       | `oklch(0.68 0.12 250)`  |
| `selectionBackground` | Dark  | `oklch(0.299 0.061 251.3)`    | `oklch(0.3 0.06 250)`   |

## [0.2.0] - 2026-07-23

### Added — `counterpart` pairing metadata

Optional `counterpart` field on every theme record, `themes.json`, `themes-slim.json`, and `index.json` entry (closes #128). Points at the theme's canonical opposite-polarity variant (`remarque-light` ⇄ `remarque-dark`, `tokyonight-storm` → `tokyonight-day`). Directional by design: several dark variants may point at one canonical light while the light points back at only the canonical dark. Computed at build time by an iterative multi-suffix stem heuristic plus a curated override map for the 9 ambiguous families (catppuccin, claude, github, gruvbox, gruvbox-material, material, rose-pine, tokyonight, zenbones); validation fails the build on a dangling or same-polarity counterpart. 129 of 547 themes carry the field.

### Added — Remarque Light / Remarque Dark native themes

Two more hand-curated native themes (closes #127). Brings native count from 15 → 17 and dataset total to 547.

- **`Remarque Light`** / **`Remarque Dark`** — the [remarque-tokens](https://github.com/williamzujkowski/remarque) design system's default palette, expressed as a terminal theme: warm paper-and-ink neutrals at hue 80, a muted blue accent at hue 250. ANSI slots use house-style hues (red 25, green 145, yellow 85, blue 250, purple 310, cyan 195) with per-color lightness solved against each theme's background so every non-blend-convention slot clears ≥ 4.6:1 contrast (margin over the classifier's 3:1 `ansi-legible` floor). Bright variants are lighter (light theme) or lighter-and-more-chromatic (dark theme) than their normal counterparts, per terminal convention.
- Both themes carry `wcag-aaa` + `ansi-legible` tags: `remarque-light` is `fgOnBg` 17.45:1, `minAnsi` 4.71:1 (`brightYellow`); `remarque-dark` is `fgOnBg` 14.43:1, `minAnsi` 5.01:1 (`yellow`). `isDark` is `false` / `true` respectively, as expected from each background's OKLCH `l`.
- Filenames `remarque-light.json` / `remarque-dark.json` (slugs `remarque-light` / `remarque-dark`) intentionally share the `remarque` stem so downstream family-pairing heuristics group them.

### Added — Phase 5b: more native themes

Eight additional hand-curated themes layered on top of the Phase 5 native source. Brings native count from 7 → 15 and dataset total to 545.

- **Vintage CRT** (3 more): `DEC VT220 Amber` (more orange than the original Amber CRT), `Hercules Graphics` (white-on-black with the slight green tint of the Hercules monochrome graphics card), `Tektronix 4014` (the storage tube's distinctive yellowish-green phosphor).
- **Accessibility** (2 more): `Tol Bright Dark` (Paul Tol's bright qualitative palette — colorblind-safe per [personal.sron.nl/~pault](https://personal.sron.nl/~pault/)), `IBM Carbon Deuteranopia Dark` (palette derived from IBM Carbon Design System's Gray 90 / functional colors, deuteranopia-tested).
- **Design-system** (3 more): `Linear Dark` (signature `#5e6ad2` indigo accent), `Radix Slate Dark` (Radix UI Slate scale), `Tailwind Slate Light` (Tailwind v4 default palette mapped to a light-mode terminal).

All three accessibility themes clear `wcag-aaa` + `ansi-legible`. Three of four design-system themes clear `wcag-aaa` + `ansi-legible`; `Tailwind Slate Light` is `wcag-aaa` but not `ansi-legible` (some bright slots fall below 3:1 against the very pale slate-50 background — that's the Tailwind palette's actual behaviour, accurately surfaced).

### Added — native (in-repo) hand-curated themes

- **`SourceConfigSchema.local`** field — when `true`, the source's theme files live in this repo under `themesPath` (relative to repo root). Local sources skip the upstream fetch step entirely, use `"local"` as their pinned `upstreamSha`, and emit `sourceUrl` permalinks that point to `main` rather than a 40-hex SHA.
- **`upstreamSha` schema** widened from `[a-f0-9]{7,40}` to also accept the literal `"local"` for native records.
- **`scripts/fetch-upstream.ts`** writes `local` to `.upstream-shas.json` for local sources without cloning anything.
- **`scripts/build.ts`** routes file reads through `sourceRootDir(source)` so local sources resolve relative to repo root.
- **`data-sources/native/`** directory holds 7 hand-curated themes filling gaps that aren't ingestible from upstreams:
  - **Vintage CRT** (3): `Amber CRT` (P3 phosphor), `IBM 5151 MDA` (the original monochrome green monitor), `Apple II Green`.
  - **Accessibility** (2): `Wong Colorblind-Safe Dark` and `Wong Colorblind-Safe Light` — palette from Bang Wong, _Nature Methods_, 2011 (deuteranopia/protanopia-safe; both clear WCAG AAA on `fgOnBg` and `ansi-legible` on `minAnsi`).
  - **Design-system-aligned** (2): `Tailwind Slate Dark` (Tailwind v4 default palette mapped to terminal slots) and `Vercel Geist Dark` (Vercel's familiar `#0070f3` blue accent + neutral grays).
- Brings the dataset to 516 themes when this PR lands on top of Phase 1 (#77) and Phase 2-4 (#78).

### Added — format-adapter layer + ghostty / jsonc / warp-yaml sources

- **`src/parsers/`** — every source format now goes through a parser that normalises into the canonical mbadolato/Windows-Terminal-JSON shape. Four formats: `windowsterminal-json` (existing), `windowsterminal-jsonc` (strips line + block comments + trailing commas), `ghostty` (`palette = N=#hex` + top-level keys), `warp-yaml` (warpdotdev `terminal_colors.normal/bright` schema, magenta → purple).
- **`SourceConfigSchema.format`** field added (optional, defaults to `windowsterminal-json` for back-compat). `SOURCE_FORMATS` constant and `SourceFormat` type exported from `src/sources.ts`.
- **`SourceConfigSchema.fileExtension`** field added for the rare source that publishes its theme files under a non-default extension; otherwise the parser's default extension drives discovery.
- **`scripts/build.ts`** dispatches by format. `readSourceFiles` filters by extension (or "no extension" for ghostty) and uses `withFileTypes` so directory entries can't slip through.
- **`test/parsers.test.ts`** — 12 new vitest cases covering each parser's happy path + a few sharp edges (single vs. double quotes in Warp YAML, JSONC trailing commas, ghostty selection-background fallback, kanagawa-paper-style header comments).
- **Six new sources onboarded** via the new format adapters:
  - `wnkz/monoglow.nvim` (Apache-2.0, ghostty) → 4 themes (lack/light/void/z).
  - `jpwol/thorn.nvim` (MIT, ghostty) → 4 themes (Dark/Light × Cold/Warm).
  - `ThorstenRhau/token` (BSD-3-Clause, ghostty) → 2 themes (dark/light).
  - `nickkadutskyi/jb.nvim` (Apache-2.0, ghostty) → 2 themes (dark/light).
  - `thesimonho/kanagawa-paper.nvim` (MIT, jsonc) → 2 themes (canvas/ink).
  - `warpdotdev/themes/special_edition` (Apache-2.0, warp-yaml) → 8 themes (Asteroid City, Barbie, Grafbase, Lumon, Oppenheimer, Pride, Thanksgiving, Winter).
- Total: 508 → 530 themes (+22) on top of Phase 1.

### Added — Phase 1 source expansion

- **Mbadolato pin bumped** to `5e4d1de9`. Picks up ~16 new themes upstream brought in since the prior pin.
- **`scottmckendry/cyberdream.nvim`** (MIT) — adds `Cyberdream` and `Cyberdream Light` (cyberpunk-aesthetic themes published in Windows Terminal JSON form via `extras/windowsterminal/`).
- **`oskarnurm/koda.nvim`** (MIT) — adds `koda-dark` and `koda-light` (minimalist).
- **`hyperb1iss/silkcircuit`** (MIT) — adds `SilkCircuit` (single distinctive theme: electric purple cursor, magenta-shifted palette).
- Total: 487 → 508 themes (+21).

### Added — multi-source data pipeline (#74)

- **`sources.json`** — ordered list of upstream theme repos to ingest. Order is the slug-collision priority order: when two sources emit the same slug, the source listed first wins and the dropped duplicate is logged at build time. `mbadolato/iTerm2-Color-Schemes` stays first so existing slugs are byte-stable.
- **`.upstream-shas.json`** — replaces the single-source `.upstream-sha`. Records the resolved commit SHA per source, written by `scripts/fetch-upstream.ts` after a successful sparse clone of every source.
- **Per-source clones** — `upstream/<source-id>/<themesPath>/*.json`. `scripts/fetch-upstream.ts` and `scripts/build.ts` iterate every source listed in `sources.json`.
- **`source` field** widens from `'iterm2-color-schemes'` (literal) to a kebab-case string validated against the active sources config. `ThemeIndex` gains `upstreamShas: Record<string, string>`; the legacy `upstreamSha` field is preserved as an alias for the primary source's SHA so older consumers keep working.
- **Public schema exports** for `SourceConfigSchema` / `SourcesConfigSchema` and types so downstream tools can introspect sources.
- **Within-source duplicate-slug guard** preserved (still fails the build). Cross-source collisions log a warning instead.
- **Warm Burnout themes** — `Warm Burnout Dark` and `Warm Burnout Light` (MIT, [`felipefdl/warm-burnout`](https://github.com/felipefdl/warm-burnout)) appear as the first non-mbadolato entries in the dataset (487 themes total).

### Added — governance + quality

- `AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` — repo governance adapted from nexus-agents v2.2.0 standards. `SECURITY.md` documents four Scorecard checks intentionally deferred (Fuzzing, CIIBestPractices, Maintained, CodeReview) with rationale.
- Prettier, ESLint strict ruleset, markdownlint, commitlint, Husky hooks, gitleaks config, lychee link-check config.
- `.github/`: CodeQL workflow, OpenSSF Scorecard, link-check workflow, gitleaks workflow (CI-side in addition to the husky hook), Dependabot config, PR + issue templates, CODEOWNERS, FUNDING.
- `.editorconfig`, `.gitattributes` for consistent line endings and indentation across editors.
- `pnpm.overrides` in `package.json` forcing patched versions of transitive advisories (`js-yaml >= 4.1.1`, `markdown-it >= 14.1.1`, `smol-toml >= 1.6.1`).

### Added — classifier and dataset

- **WCAG 2.x contrast data** on every `TerminalColorTheme` (#58). Adds `contrast: { fgOnBg, minAnsi, minAnsiSlot }` and five new tags — `wcag-aaa`, `wcag-aa`, `wcag-aa-large`, `wcag-fail`, `ansi-legible`. Existing `high-contrast` / `low-contrast` tags retained for back-compat. `minAnsi` excludes the slot(s) that conventionally blend with the background (`black` + `brightBlack` on dark themes, `white` + `brightWhite` on light themes) so intentional near-bg slots don't false-flag otherwise well-formed themes. `SlimTheme` also carries `contrast` so the picker can read it without pulling the full dataset.
- Corpus distribution at the current pinned SHA: 410 AAA, 463 AA, 9 `wcag-fail`, 255 `ansi-legible`.

### Added — GitHub Pages theme-picker site

- `site/` — Astro 5 project deployed to https://williamzujkowski.github.io/oklch-terminal-themes/ via `.github/workflows/pages.yml`. Dogfoods the npm package via `workspace:*` — no re-parsing of upstream iTerm schemes.
- **Combobox picker + live showcase** (#46). The original grid-of-tiles was replaced with a single theme-selector combobox and a live scrolling showcase painted from the active theme's palette: full 20-swatch palette, terminal session, IDE mock with tree / tabs / code / status bar, a blog/reading view with callouts, and a dashboard with stat cards / tables / progress bars.
- **Search + tag filters** in the listbox. 8 chips: dark / light / vibrant / muted / `wcag-aaa` / `wcag-aa` / `ansi-legible` / popular. URL state round-trips (`?q=...&tags=...`).
- **WCAG badge** in the showcase header (#59). Shows the tier + fg/bg ratio (`AAA · fg 13.4:1`); green tint for AAA, red for Fail, neutral accent otherwise. Explicitly labels the ratio as `fg` so users don't assume the rating certifies ANSI-slot legibility.
- **Export menu**: copy `:root` CSS vars, Tailwind v4 `@theme` block, raw JSON, or shareable permalink (`?theme=<slug>`). Graceful "Clipboard blocked" toast when the Clipboard API is denied.
- **Palette chip copy-to-clipboard**: clicking any of the 20 palette chips copies its `oklch(...)` string, with a status toast.
- **Site-chrome light / dark toggle** (separate from the theme preview). Inline pre-paint script prevents FOUC; explicit preference persists via `localStorage`; OS changes still propagate when no explicit choice has been made.
- **Mobile responsive** (#52, #61, #62). Every element fits a 390px viewport without horizontal scroll: showcase containers capped at `min-width: 0` so deep `<pre>` descendants contain their own overflow; IDE tree hidden at ≤ 30rem; palette grid drops to 2 columns; dashboard panels stack; ThemeSelector primary row stacks the combobox above prev / next / random / export. At ≤ 30rem the IDE code and reading `<pre>` switch to `white-space: pre-wrap` and the terminal gets a tight font (content pre-trimmed so no-wrap already fit, but pre-wrap is now an unconditional guarantee).
- **Sticky control band** (#61). The ThemeSelector is `position: sticky; top: 0` with a backdrop-blurred tint and `env(safe-area-inset-top)`-aware padding, so prev / combobox / next / random / export stay on-screen while the user scrolls through the showcase.
- **Collapsed palette on mobile** (#62). The palette section is a `<details>` — open by default on desktop, closed on first paint at ≤ 30rem so the terminal mock is above the fold. User toggles persist across re-paints.
- **Keyboard shortcuts**: `/` opens the listbox, `←` / `→` cycle prev/next theme, `r` picks a random theme, `Esc` closes the listbox.
- **A11y**: `aria-pressed` tag chips + toggle; `aria-live` filter count; `role="status"` copy toast; descriptive `aria-label`s on interactive affordances; full keyboard tabbing. Lighthouse + axe wired into CI so regressions are caught at PR time.
- **Performance**: single static HTML page; the controller script is the only JS bundle. Themes-slim data is embedded as inline JSON for zero-roundtrip preview lookups.
- **Open Graph + Twitter card meta**, canonical URL, robots directive, and a 1200×630 OG image — shared links in Slack / Discord / iMessage render with title + description + preview image.
- **Unit tests** for the site library (`theme-filter.ts` + `formatters.ts`) — 30 vitest cases covering filter matching, URL parse/serialise round-trips, CSS/Tailwind/JSON formatters, permalink construction, and WCAG label/ratio formatting. Wired into CI.

### Added — release + publish automation

- **OIDC Trusted Publishing** to npm for the root package.
- **Conventional-Commit-driven GitHub Releases** via commit labels.

### Removed

- **Side-by-side compare mode** (#53). With 485 themes the primary job is discovery (search / filter / random / prev / next), not A/B comparison. Removing it collapsed the dual-slot state machine, removed `?compare=<slug>`, dropped the `c` keyboard shortcut, and simplified the controller by ~160 lines. Permalink format `?theme=<slug>` unchanged.

### Changed

- CI workflow now runs commitlint (on PRs), ESLint, Prettier format check, markdownlint, typecheck, tests, full build-and-validate pipeline, site build + typecheck + tests, Lighthouse, axe, and pnpm audit. `CI Success` gate job aggregates all required checks.
- Dark-mode `--border` fixed (#62): was `oklch(1 1 0 / 0.12)` — chroma=1 at hue=0 is extreme red, giving every border a visible red tint once composited over the dark background. Now `oklch(1 0 0 / 0.12)` (achromatic white at 12% alpha), matching the shape of the light-mode `oklch(0 0 0 / 0.12)` value.
- Upgraded dev dependencies: eslint 9 → 10, @commitlint/\* 19 → 20, lint-staged 15 → 16, markdownlint-cli2 0.15 → 0.22, vitest 2 → 4, vite 6 → 7, zod 3 → 4. Held back: `@types/node` (tracks Node 22 LTS), `typescript` (kept on 5.9.x — Astro 5 ecosystem's peer range excludes TS 6).
- Upgraded all GitHub Actions to latest releases and **pinned every `uses:` line by commit SHA** with a `# v<tag>` comment (closes Scorecard PinnedDependenciesID alerts). `pnpm/action-setup` held on v4 — v6 regressed `ERR_PNPM_BROKEN_LOCKFILE` under `--frozen-lockfile` on a single-document YAML lockfile.
- Dependabot config groups minor/patch npm updates, groups dev-dep majors (ignoring `@types/node` majors — tracks LTS runtime), and groups all action bumps — green CI is the gate, not manual triage of each tag.
- `lint:md` command uses inline negation globs (`!**/node_modules/**`) instead of markdownlint-cli2's `#` ignore syntax — the latter expanded the full glob first on a workspace-scale `node_modules` and hit a 4 GB heap ceiling.

## [0.1.0] — 2026-04-14

### Added

- Initial scaffold: sparse-clone upstream `mbadolato/iTerm2-Color-Schemes`, convert hex → OKLCH via `culori`, classify (`isDark` + tags), validate with Zod, emit `data/themes.json`, `data/themes-slim.json`, `data/index.json`, and `data/by-name/<slug>.json`.
- 20 color keys per theme (background, foreground, cursor, selection, 8 ANSI, 8 bright ANSI).
- ΔE2000 round-trip gate (< 1.0), duplicate-slug guard, pinned upstream SHA in every record.
- Public API: `themeToCssVars`, `convertHexToColor`, `roundTripDeltaE`, `hexFromOklch`, `classifyTheme`, `toSlug`, all Zod schemas.

[Unreleased]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/williamzujkowski/oklch-terminal-themes/releases/tag/v0.1.0
