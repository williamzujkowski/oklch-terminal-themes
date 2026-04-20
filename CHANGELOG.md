# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- AGENTS.md, CODING_STANDARDS.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md — repo governance adapted from nexus-agents v2.2.0 standards.
- Prettier, ESLint strict ruleset, markdownlint, commitlint, Husky hooks, gitleaks config, lychee link-check config.
- `.github/`: CodeQL workflow, OpenSSF Scorecard, link-check workflow, Dependabot config, PR and issue templates, CODEOWNERS, FUNDING.
- `.editorconfig`, `.gitattributes` for consistent line endings and indentation across editors.

### Changed

- CI workflow now runs commitlint (on PRs), ESLint, Prettier format check, typecheck, tests, and the full build-and-validate pipeline.

## [0.1.0] — 2026-04-14

### Added

- Initial scaffold: sparse-clone upstream `mbadolato/iTerm2-Color-Schemes`, convert hex → OKLCH via `culori`, classify (`isDark` + tags), validate with Zod, emit `data/themes.json`, `data/themes-slim.json`, `data/index.json`, and `data/by-name/<slug>.json`.
- 20 color keys per theme (background, foreground, cursor, selection, 8 ANSI, 8 bright ANSI).
- ΔE2000 round-trip gate (< 1.0), duplicate-slug guard, pinned upstream SHA in every record.
- Public API: `themeToCssVars`, `convertHexToColor`, `roundTripDeltaE`, `hexFromOklch`, `classifyTheme`, `toSlug`, all Zod schemas.

[Unreleased]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/williamzujkowski/oklch-terminal-themes/releases/tag/v0.1.0
