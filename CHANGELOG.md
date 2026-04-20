# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — governance + quality

- AGENTS.md, CODING_STANDARDS.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md — repo governance adapted from nexus-agents v2.2.0 standards. SECURITY.md documents four Scorecard checks intentionally deferred (Fuzzing, CIIBestPractices, Maintained, CodeReview) with rationale.
- Prettier, ESLint strict ruleset, markdownlint, commitlint, Husky hooks, gitleaks config, lychee link-check config.
- `.github/`: CodeQL workflow, OpenSSF Scorecard, link-check workflow, gitleaks workflow (CI-side, in addition to the husky hook), Dependabot config, PR + issue templates, CODEOWNERS, FUNDING.
- `.editorconfig`, `.gitattributes` for consistent line endings and indentation across editors.
- `pnpm.overrides` in `package.json` to force patched versions of transitive advisories (`js-yaml >= 4.1.1`, `markdown-it >= 14.1.1`, `smol-toml >= 1.6.1`).

### Added — GitHub Pages theme-picker site

- `site/` — Astro 5 project deployed to https://williamzujkowski.github.io/oklch-terminal-themes/ via `.github/workflows/pages.yml`. Dogfoods the npm package via `workspace:*` — no re-parsing of upstream iTerm schemes.
- **Picker grid**: 485 theme cards (popular-first + alphabetical), responsive CSS grid.
- **Filters**: search by name/slug + 7 tag chips (dark / light / vibrant / muted / high-contrast / low-contrast / popular). URL state round-trips (`?q=...&tags=...`).
- **Dual-pane preview**: selecting a card sets `?theme=<slug>` and renders two live mocks painted from the theme's palette — a terminal widget covering all 16 ANSI slots + cursor + fg, and a mini web-page chrome (nav / hero / CTA / success/danger chips / card grid / code block) mapping `blue`→links, `green`→success, `red`→danger, `purple`→accent.
- **Actions panel**: copy `:root` CSS vars, Tailwind v4 `@theme` block, raw JSON, or shareable permalink. Graceful "Clipboard blocked" toast when the Clipboard API is denied.
- **Site-chrome dark-mode toggle** (separate from the theme preview). Inline pre-paint script prevents FOUC; explicit preference persists via `localStorage`; OS changes still propagate when no explicit choice has been made.
- **A11y**: `aria-pressed` tag chips and toggle; `aria-live` filter count; `role="status"` copy toast; descriptive `aria-label`s on interactive affordances; full keyboard tabbing.
- **Performance**: single static HTML page (no JS bundle — all interactive scripts inlined). Themes-slim data embedded as inline JSON for zero-roundtrip preview lookups.

### Changed

- CI workflow now runs commitlint (on PRs), ESLint, Prettier format check, markdownlint, typecheck, tests, full build-and-validate pipeline, site build+typecheck, and pnpm audit.
- Upgraded dev dependencies: eslint 9 → 10, @commitlint/\* 19 → 20, lint-staged 15 → 16, markdownlint-cli2 0.15 → 0.22. Held back: `@types/node` (tracks Node 22 LTS), `vite` (vitest 4 peer constraint), `typescript` (kept on 5.9.x — Astro 5 ecosystem's peer range excludes TS 6).
- Upgraded all GitHub Actions to latest releases and **pinned every `uses:` line by commit SHA** with a `# v<tag>` comment (closes Scorecard PinnedDependenciesID alerts). `pnpm/action-setup` held on v4 — v6 regressed `ERR_PNPM_BROKEN_LOCKFILE` under `--frozen-lockfile` on a single-document YAML lockfile.
- Dependabot config groups minor/patch npm updates, groups dev-dep majors (ignoring `@types/node` majors — tracks LTS runtime), and groups all action bumps — green CI is the gate, not manual triage of each tag.
- `lint:md` command uses inline negation globs (`!**/node_modules/**`) instead of markdownlint-cli2's `#` ignore syntax — the latter expanded the full glob first on a workspace-scale \`node_modules\` and hit a 4 GB heap ceiling.
- Added `ci.yml` job to verify site build + typecheck on every PR. `CI Success` gate job aggregates all required checks.

### Deferred

- **Side-by-side compare mode.** Tracked in [issue #20](https://github.com/williamzujkowski/oklch-terminal-themes/issues/20) with a path-forward write-up. Requires parameterising `PreviewPane.astro`'s hard-coded element IDs so two instances can coexist.
- **Lighthouse + axe-core automated a11y gate.** Tracked in [issue #18](https://github.com/williamzujkowski/oklch-terminal-themes/issues/18). Manual chrome-automation audit was clean (zero console errors, 1 HTTP resource, keyboard tabbing verified) but an automated check in CI would prevent regressions.

## [0.1.0] — 2026-04-14

### Added

- Initial scaffold: sparse-clone upstream `mbadolato/iTerm2-Color-Schemes`, convert hex → OKLCH via `culori`, classify (`isDark` + tags), validate with Zod, emit `data/themes.json`, `data/themes-slim.json`, `data/index.json`, and `data/by-name/<slug>.json`.
- 20 color keys per theme (background, foreground, cursor, selection, 8 ANSI, 8 bright ANSI).
- ΔE2000 round-trip gate (< 1.0), duplicate-slug guard, pinned upstream SHA in every record.
- Public API: `themeToCssVars`, `convertHexToColor`, `roundTripDeltaE`, `hexFromOklch`, `classifyTheme`, `toSlug`, all Zod schemas.

[Unreleased]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/williamzujkowski/oklch-terminal-themes/releases/tag/v0.1.0
