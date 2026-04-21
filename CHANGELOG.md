# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/williamzujkowski/oklch-terminal-themes/releases/tag/v0.1.0
