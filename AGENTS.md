# AGENTS.md — oklch-terminal-themes

Guidance for AI coding agents (Claude Code, OpenCode, Codex, Gemini CLI, Cursor, Aider, Goose, Continue, Cline) working in this repo.

This file is the equivalent of what Codex/OpenCode call `AGENTS.md` and what Claude Code treats as `CLAUDE.md`. All agents, regardless of client, should read this file first and treat it as authoritative context.

---

## What this repo is

`@williamzujkowski/oklch-terminal-themes` — a canonical dataset of <!-- theme-count -->908<!-- /theme-count --> terminal color schemes, published as an npm package + static JSON API, and an Astro showcase. Users compare the same live UI samples across palettes instead of comparing screenshots. OKLCH lightness/chroma/hue and the derived metrics explain the palette; they do not guarantee accessibility of every UI built from it.

Read `sources.json` for the active sources, including native themes. Upstream licenses vary; [README Attribution](./README.md#attribution) and [NOTICE](./NOTICE) carry the current attribution and license texts.

**Owner:** @williamzujkowski
**License:** MIT for this project's code and native themes; source-specific licenses for imported themes.
**Runtime:** Node.js 26.x Active LTS for the toolchain and CI (`.nvmrc`); the published package supports Node `>=22`, tested on 22/24/26
**Language:** TypeScript 6.0 (7.x blocked on typescript-eslint and `astro check` support) (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
**Package manager:** pnpm 12.x (dependabot-core#15904 fixed 2026-11-03; verified 2026-11-22)
**Tests:** Vitest 5.x

---

## Primary instructions

The authoritative project rules live in **[CODING_STANDARDS.md](./CODING_STANDARDS.md)**. Read that file before making substantive changes. It covers:

- Prime directive (correctness > simplicity > performance > cleverness)
- TDD, YAGNI, DRY discipline
- Code structure limits (400-line file / 50-line function / complexity 10 / 5 params / 4 depth)
- Zero `any` TypeScript policy
- **Data pipeline standards** (§5): pinned upstream SHA, Zod validation gate, ΔE2000 < 1.0 round-trip, JSON-safe numeric fields, determinism, duplicate-slug guard
- **Upstream attribution invariants** (§6)
- Quality gates (pre-commit, pre-merge, pre-release)

If any instruction in this file conflicts with `CODING_STANDARDS.md`, `CODING_STANDARDS.md` wins.

---

## Quick reference

```bash
# Install
pnpm install

# Full pipeline
pnpm tsx scripts/fetch-upstream.ts   # restores pinned remote sources; native sources stay local
pnpm build:data                      # emits data/*.json
pnpm validate                        # Zod + ΔE gate + within-source duplicate-slug guard
pnpm build:ts                        # compiles src/ to dist/

# Data generation + TS compilation (fetch and final validation are separate)
pnpm build

# Quality gates
pnpm lint
pnpm typecheck
pnpm test

# Restore sources at existing pins, then rebuild data
pnpm run update
```

---

## Core invariants — do not violate

These are the reasons this package exists. Every change is evaluated against them:

1. **Pinned upstream SHAs.** `sources.json` lists sources; `.upstream-shas.json` pins remote sources to commits. Remote records embed the SHA and a permalink at that SHA. Native sources currently use `upstreamSha: 'local'` and a `main` URL; these links are not immutable. Never use `HEAD` as a remote dataset SHA.
2. **ΔE2000 < 1.0 round-trip.** Every `hex → OKLCH → hex` round-trip must satisfy `differenceCiede2000 < 1.0`. If it fails, the build fails. Do not raise the threshold to unblock a build.
3. **Zod validates every boundary.** Remote input is parsed through `UpstreamSchemeSchema`, native input through `NativeSchemeSchema`, and emitted JSON through `scripts/validate.ts`. No type assertions on untrusted input.
4. **JSON-safe numerics.** OKLCH `l ∈ [0, 1]`, `c ∈ [0, 0.5]`, `h` finite (culori's `NaN` for achromatic colors coerced to `0`). `NaN`/`Infinity` never escape `convertHexToColor`.
5. **Stable rebuilds.** Themes sorted by slug with fixed decimal precision. `src/preserve.ts` retains timestamps when record content is unchanged. Rebuilding unchanged inputs against the same existing `data/` produces no timestamp-only diff; clean builds without previous data use the current build time.
6. **Duplicate-slug guard.** Two files collapsing to the same slug **within a single source** fails the build with both filenames logged. Across sources, `sources.json` order resolves the collision (first source wins, dropped duplicate logged).
7. **Attribution is mandatory.** Every record has `source` (a source id from `sources.json`), `sourceUrl`, and `upstreamSha`. `NOTICE` ships in the tarball with all sources listed.
8. **No network in tests.** Offline fixtures only. CI may run without network access during `pnpm test`.

---

## Read for the task

| When changing…                      | Read first                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Live previews, controls, or styling | [site/README.md](./site/README.md), then the relevant `site/src/components/Showcase*.astro` and `site/src/lib/` modules            |
| Metric explanations or filters      | [Choosing a theme](./docs/CHOOSING_A_THEME.md), `src/classify.ts`, `src/cvd.ts`, `src/apca.ts`, and `site/src/lib/theme-filter.ts` |
| Conversion or input formats         | `src/convert.ts`, `src/schema.ts`, `src/parsers/`, and the matching tests                                                          |
| Build orchestration or provenance   | `scripts/build.ts`, `src/collect.ts`, `src/assemble.ts`, `src/preserve.ts`, and `sources.json`                                     |
| Export formats                      | `src/css-export.ts`, `src/schemes.ts`, `src/dtcg.ts`, and `scripts/write-exports.ts`                                               |
| Native theme definitions            | [CONTRIBUTING.md — native themes](./CONTRIBUTING.md#adding-or-editing-a-native-theme) and `data-sources/native/`                   |
| Package releases                    | [docs/RELEASING.md](./docs/RELEASING.md)                                                                                           |

`src/` contains library/build logic; `scripts/` orchestrates file and network I/O;
`site/` contains the showcase; `test/` and `site/test/` contain their respective
tests. `data/` is generated output and must not be hand-edited.

---

## Workflow guidance for agents

### Before editing conversion or schema code

1. Read `CODING_STANDARDS.md` §5 (Data Pipeline Standards).
2. Read existing tests in `test/convert.test.ts` — they encode the invariants.
3. Write a failing test first (red) → minimum code to pass (green) → refactor.

### Before bumping the upstream SHA manually

- Don't, unless the user asked. The weekly CI job (`.github/workflows/update.yml`) owns this. Opening a manual PR bypasses the round-trip ΔE gate running against a clean runner.
- If the user did ask: run `rm -f .upstream-shas.json && pnpm run update && pnpm validate && pnpm test` locally and inspect the dataset diff.

### Before changing `COLOR_KEYS` or the schema

- This is a **breaking change** to every downstream consumer. Needs a major version bump and a migration note in `CHANGELOG.md`. Raise it explicitly with the user before editing `src/types.ts` or `src/schema.ts`.

### Before adding a runtime dependency

- Production `dependencies` should contain **only `culori`, `apca-w3` and `zod`** today (`apca-w3` added for issue #151's ratified, library-mandated APCA condition; `zod` because the public API exports the schemas). Everything else belongs in `devDependencies`. Adding to production is a design decision — surface it to the user first.

### Before touching `files`, `exports`, or `main` in `package.json`

- That's the public API surface. Raise the impact explicitly. See `CODING_STANDARDS.md` §8.3.

### When a test or gate fails

- Follow `CODING_STANDARDS.md` §11.2 (Failure handling): state failure + raw error, state theory, propose ONE next step, wait. **No silent retries. No bypassing `--no-verify`.**

---

## Commit and PR conventions

- **Conventional Commits** enforced by `commitlint` via husky `commit-msg` hook. Types: `feat | fix | refactor | docs | test | chore | perf`.
- Example: `feat(classify): add "pastel" tag for low-chroma light themes` / `fix(convert): coerce NaN hue for achromatic whites`.
- PR title matches the squash-merge commit title. Keep PRs < 400 lines changed, single purpose.
- PR description includes: summary, changes, test plan.

---

## Security & attribution

- **Security disclosure:** see `SECURITY.md`. Do not file public issues for vulnerabilities.
- **Secrets:** never commit tokens. `.gitignore` + optional local gitleaks hook.
- **Upstream licenses:** check each source's license in `sources.json` and retain its notices. Do not remove `NOTICE` or the README Attribution section.
- **No user input at runtime:** the npm package ships static JSON + pure functions. Surface area is small — keep it that way.

---

## Quick map — where to find things

| Need                  | Go to                                                    |
| --------------------- | -------------------------------------------------------- |
| Coding standards      | [CODING_STANDARDS.md](./CODING_STANDARDS.md)             |
| Contribution workflow | [CONTRIBUTING.md](./CONTRIBUTING.md)                     |
| Public API            | [src/index.ts](./src/index.ts)                           |
| Dataset shape         | [src/schema.ts](./src/schema.ts)                         |
| Conversion math       | [src/convert.ts](./src/convert.ts)                       |
| Classifier heuristics | [src/classify.ts](./src/classify.ts)                     |
| Build pipeline        | [scripts/build.ts](./scripts/build.ts)                   |
| Upstream sync         | [scripts/fetch-upstream.ts](./scripts/fetch-upstream.ts) |
| Validation gate       | [scripts/validate.ts](./scripts/validate.ts)             |
| Upstream attribution  | [NOTICE](./NOTICE)                                       |
| Security disclosure   | [SECURITY.md](./SECURITY.md)                             |
| Code of conduct       | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)               |
| Changelog             | [CHANGELOG.md](./CHANGELOG.md)                           |

---

_Adapted from nexus-agents AGENTS.md / CLAUDE.md conventions (v2026-04-19). Scoped to this repo's shape: a small TS library + data pipeline, not an orchestration platform._
