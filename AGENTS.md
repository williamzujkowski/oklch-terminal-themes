# AGENTS.md — oklch-terminal-themes

Guidance for AI coding agents (Claude Code, OpenCode, Codex, Gemini CLI, Cursor, Aider, Goose, Continue, Cline) working in this repo.

This file is the equivalent of what Codex/OpenCode call `AGENTS.md` and what Claude Code treats as `CLAUDE.md`. All agents, regardless of client, should read this file first and treat it as authoritative context.

---

## What this repo is

`@williamzujkowski/oklch-terminal-themes` — a canonical dataset of 450+ terminal color schemes sourced from [`mbadolato/iTerm2-Color-Schemes`](https://github.com/mbadolato/iTerm2-Color-Schemes) (MIT), converted to OKLCH, validated with Zod, and republished as an npm package + JSON API. Consumed by Astro sites, theme pickers, Tailwind v4 `@theme` blocks, and any tool that wants a clean OKLCH palette without parsing iTerm XML or Alacritty TOML.

**Owner:** @williamzujkowski
**License:** MIT
**Runtime:** Node.js 22.x LTS
**Language:** TypeScript 5.9+ (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
**Package manager:** pnpm 9.x
**Tests:** Vitest 4.x

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
pnpm tsx scripts/fetch-upstream.ts   # clones upstream at pinned SHA
pnpm build:data                      # emits data/*.json
pnpm validate                        # Zod + ΔE gate + duplicate-slug guard
pnpm build:ts                        # compiles src/ to dist/

# Or everything at once
pnpm build

# Quality gates
pnpm lint
pnpm typecheck
pnpm test

# Weekly upstream sync (CI does this automatically)
pnpm update
```

---

## Core invariants — do not violate

These are the reasons this package exists. Every change is evaluated against them:

1. **Pinned upstream SHA.** `.upstream-sha` is the source of truth for dataset provenance. Every emitted theme record embeds `upstreamSha` and a `sourceUrl` permalink at that SHA. Never commit `HEAD` as a dataset SHA.
2. **ΔE2000 < 1.0 round-trip.** Every `hex → OKLCH → hex` round-trip must satisfy `differenceCiede2000 < 1.0`. If it fails, the build fails. Do not raise the threshold to unblock a build.
3. **Zod validates every boundary.** Upstream JSON is parsed through `UpstreamSchemeSchema`. Emitted JSON is checked by `scripts/validate.ts`. No type assertions on untrusted input.
4. **JSON-safe numerics.** OKLCH `l ∈ [0, 1]`, `c ∈ [0, 0.5]`, `h` finite (culori's `NaN` for achromatic colors coerced to `0`). `NaN`/`Infinity` never escape `convertHexToColor`.
5. **Deterministic output.** Themes sorted by slug. Fixed decimal precision. `updatedAt` generated once per build. Byte-identical output for the same upstream SHA.
6. **Duplicate-slug guard.** Two upstream files collapsing to the same slug fails the build with both filenames logged.
7. **Attribution is mandatory.** Every record has `source: 'iterm2-color-schemes'`, `sourceUrl`, and `upstreamSha`. `NOTICE` ships in the tarball.
8. **No network in tests.** Offline fixtures only. CI may run without network access during `pnpm test`.

---

## Directory map

```
src/
├── index.ts       # Public API barrel — re-exports types, conversion, classification, schema, helpers
├── types.ts       # Type definitions, COLOR_KEYS (20 keys: bg, fg, cursor, selection, 8 ANSI, 8 bright ANSI)
├── schema.ts      # Zod schemas for upstream input and emitted output
├── convert.ts     # hex ↔ OKLCH, ΔE2000 round-trip, numeric clamping/rounding
├── classify.ts    # isDark + tag derivation (dark/light, vibrant/muted, high/low-contrast, popular)
└── slug.ts        # name → kebab-case slug

scripts/
├── fetch-upstream.ts   # sparse clone upstream/windowsterminal, write .upstream-sha
├── build.ts            # read upstream JSON → validate → convert → classify → emit data/*.json
└── validate.ts         # final gate: Zod re-parse + ΔE round-trip + duplicate-slug check

test/
├── convert.test.ts     # ΔE round-trip, clamping, achromatic NaN coercion
└── fixtures/           # offline upstream JSON samples

data/                   # generated — do not hand-edit
├── themes.json         # full dataset
├── themes-slim.json    # slug + name + isDark + ready-to-paste oklch() strings
├── index.json          # metadata-only index
└── by-name/*.json      # per-theme lazy-load files

.upstream-sha           # pinned upstream commit SHA (single source of truth for provenance)
```

---

## Workflow guidance for agents

### Before editing conversion or schema code

1. Read `CODING_STANDARDS.md` §5 (Data Pipeline Standards).
2. Read existing tests in `test/convert.test.ts` — they encode the invariants.
3. Write a failing test first (red) → minimum code to pass (green) → refactor.

### Before bumping the upstream SHA manually

- Don't, unless the user asked. The weekly CI job (`.github/workflows/update.yml`) owns this. Opening a manual PR bypasses the round-trip ΔE gate running against a clean runner.
- If the user did ask: run `rm -f .upstream-sha && pnpm update && pnpm validate && pnpm test` locally and inspect the dataset diff.

### Before changing `COLOR_KEYS` or the schema

- This is a **breaking change** to every downstream consumer. Needs a major version bump and a migration note in `CHANGELOG.md`. Raise it explicitly with the user before editing `src/types.ts` or `src/schema.ts`.

### Before adding a runtime dependency

- Production `dependencies` should contain **only `culori`** today. Everything else belongs in `devDependencies`. Adding to production is a design decision — surface it to the user first.

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
- **Upstream license:** upstream is MIT; we redistribute per that license. Do not remove `NOTICE` or the README Attribution section.
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
