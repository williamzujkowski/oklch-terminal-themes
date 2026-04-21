# oklch-terminal-themes — Coding Standards

**Version:** 1.0.0
**Last Updated:** 2026-04-20 (ET)
**Status:** Active

Adapted from the nexus-agents standards (v2.2.0). Scoped to the concerns that actually
apply here: a small TypeScript library that fetches an upstream color dataset, converts
to OKLCH, validates with Zod, and republishes as an npm package + JSON API.

---

## Table of Contents

0. [Prime Directive](#0-prime-directive)
1. [Time & Verification Authority](#1-time--verification-authority)
2. [Source Hygiene](#2-source-hygiene)
3. [Code Structure Limits](#3-code-structure-limits)
4. [TypeScript Standards](#4-typescript-standards)
5. [Data Pipeline Standards (OKLCH-specific)](#5-data-pipeline-standards-oklch-specific)
6. [Upstream Attribution Invariants](#6-upstream-attribution-invariants)
7. [Testing Standards](#7-testing-standards)
8. [Dependency Management](#8-dependency-management)
9. [Security Standards](#9-security-standards)
10. [Quality Gates](#10-quality-gates)
11. [Execution Protocol](#11-execution-protocol)

---

## Quick Start

```bash
# Run all quality gates (must pass before commit / merge)
pnpm lint && pnpm typecheck && pnpm test && pnpm validate

# Full pipeline locally
pnpm tsx scripts/fetch-upstream.ts
pnpm build:data
pnpm validate
pnpm test
```

---

## 0. Prime Directive

```
correctness > simplicity > performance > cleverness
```

| Priority        | Test                                                                  |
| --------------- | --------------------------------------------------------------------- |
| **Correctness** | Does it match the source-of-truth hex, within ΔE2000 < 1.0? Tested?   |
| **Simplicity**  | Could a new contributor understand the build pipeline in 5 minutes?   |
| **Performance** | Does the weekly upstream sync finish in < 2 min on a clean CI runner? |
| **Cleverness**  | Never. Color math already has enough subtlety — do not add more.      |

### 0.1 Development Disciplines (non-negotiable)

**Red/Green TDD** — Failing test first, minimum code to pass, then refactor. Tests define the spec; code satisfies it. The OKLCH conversion invariants (round-trip ΔE, clamping, JSON-safety of hue) were written as tests first; keep it that way.

**YAGNI** — No speculative abstractions. If a second color space is ever needed, add it then — do not pre-build an "adapter" for a single consumer today.

**DRY** — Every piece of knowledge has a single authoritative representation. `COLOR_KEYS` is defined once in `src/types.ts` and reused everywhere. `UPSTREAM_KEY_MAP` lives in one place. Two instances is a coincidence, three is a pattern worth extracting.

### 0.2 Boring Code Test

If you died tomorrow, could the next maintainer reproduce a build by reading the code once? If not, simplify.

---

## 1. Time & Verification Authority

- Timestamps in build output use ISO 8601 UTC (`new Date().toISOString()`). The schema enforces this (`updatedAt` is `z.iso.datetime()`).
- All human-facing decisions and logs use **America/New_York (ET)**. Verify with `TZ='America/New_York' date` before time-sensitive ops (releases, dated changelogs).
- Before using any dependency/tool/API: check current stable version, verify it is not deprecated, document the version check with a date. This repo pins `@williamzujkowski/oklch-terminal-themes` upstream data via `.upstream-sha` — the same discipline applies to code dependencies.

---

## 2. Source Hygiene

When making authoritative claims, cite primary sources in this order:

1. **Specifications** — CSS Color 4 / 5 (OKLCH, `oklch()` syntax), WCAG 2.2.
2. **Official documentation** — `culori` docs, TypeScript handbook, Node.js LTS docs.
3. **Upstream dataset** — `mbadolato/iTerm2-Color-Schemes` `windowsterminal/` JSON at the pinned SHA.
4. **RFCs / W3C** — where color semantics or accessibility are involved.

**Do not cite** as justification: blog posts, Medium articles, vendor marketing pages, unverified Stack Overflow answers.

Citation format inside code comments:

```ts
// (Source: CSS Color Module Level 4, § 9.3 The oklch() notation)
// (Verify: not confirmed against current culori release notes — 2026-04-20)
```

---

## 3. Code Structure Limits

### 3.1 Hard limits (enforced by ESLint)

| Metric                  | Limit       | Rationale                              |
| ----------------------- | ----------- | -------------------------------------- |
| File length             | ≤ 400 lines | Reviewability                          |
| Function length         | ≤ 50 lines  | Single responsibility, testability     |
| Cyclomatic complexity   | ≤ 10        | Understandability                      |
| Parameters per function | ≤ 5         | Use an options object for more         |
| Nesting depth           | ≤ 4 levels  | Early returns, guard clauses preferred |

### 3.2 Splitting rules

Approaching a limit → extract by responsibility (conversion ≠ classification ≠ I/O). Do not split mid-function. Do not split by line count alone; split by seam.

### 3.3 Interfaces before implementations

Define types in `src/types.ts` first, then code against them. Public exports in `src/index.ts` re-export types and concrete functions; the barrel is part of the public API surface.

---

## 4. TypeScript Standards

### 4.1 Required compiler options

`tsconfig.json` MUST keep at minimum:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

### 4.2 Type-safety rules — zero `any` policy

**`any` is banned.** ESLint enforces `@typescript-eslint/no-explicit-any: 'error'`.

| Instead of            | Use                                |
| --------------------- | ---------------------------------- |
| `any` parameter       | `unknown` + type guard / Zod parse |
| `as any` cast         | `as unknown as TargetType` (rare)  |
| `Record<string, any>` | `Record<string, unknown>`          |
| `any` in tests        | `as unknown as ExpectedType`       |

Rare exceptions must have `// eslint-disable-next-line` with a documented reason on the line above. Exceptions are reviewed on PR — assume they will be pushed back.

### 4.3 Runtime validation at boundaries

All untrusted input — upstream JSON files, emitted dataset JSON, and the schema-exported types in `src/schema.ts` — MUST flow through Zod parsers. Trust internal code; validate at system boundaries.

```ts
// GOOD — validate upstream JSON at the boundary
const parsed = UpstreamSchemeSchema.parse(raw);

// BAD — trust that upstream JSON matches the shape
const parsed = raw as UpstreamScheme;
```

### 4.4 Naming conventions

| Kind       | Convention            | Example                          |
| ---------- | --------------------- | -------------------------------- |
| Interfaces | PascalCase (no `I`)   | `TerminalColorTheme`             |
| Types      | PascalCase            | `ColorKey`, `Oklch`              |
| Functions  | camelCase, verb-first | `convertHexToColor`, `toSlim`    |
| Constants  | SCREAMING_SNAKE       | `COLOR_KEYS`, `UPSTREAM_KEY_MAP` |
| Files      | kebab-case            | `fetch-upstream.ts`              |
| Tests      | `.test.ts` suffix     | `convert.test.ts`                |

> **Divergence from nexus-agents:** we drop the `I`-prefix for interfaces. This repo has no adapter sprawl that makes `I` prefixes earn their keep; `TerminalColorTheme` is clearer than `ITerminalColorTheme`. Everything else matches.

### 4.5 Semantic names

Specific over short. Intent over type. Booleans are predicates (`isDark`, `hasAlpha`, `canRoundTrip`).

---

## 5. Data Pipeline Standards (OKLCH-specific)

These rules are the whole reason this repo exists. Violating any of them ships broken data to every downstream consumer.

### 5.1 Pinned upstream SHA discipline

- `.upstream-sha` is the single source of truth for which upstream commit produced the dataset. Never embed `HEAD` in a dataset record's `sourceUrl`.
- `scripts/fetch-upstream.ts` MUST write the resolved SHA to `.upstream-sha` after a successful fetch.
- `scripts/build.ts` MUST read that SHA, embed it in every `TerminalColorTheme` (`upstreamSha` field), and use it to build each `sourceUrl` as a permalink.
- `sourceUrl` links resolve against a specific SHA so dataset records stay reproducible even after upstream force-pushes or deletes files.

### 5.2 Zod validation is the gate, not a suggestion

- Every JSON file written to `data/` MUST be validated by `scripts/validate.ts` before release.
- The `UpstreamSchemeSchema.parse(raw)` call at the upstream boundary is the only acceptable shape check. Type assertions on upstream input are forbidden.
- Validation failures fail the build loudly. Silent drops are a correctness bug.

### 5.3 Round-trip invariant — ΔE2000 < 1.0

- Every hex → OKLCH → hex round-trip MUST satisfy `differenceCiede2000 < 1.0`. Tested in `test/convert.test.ts`; enforced by `pnpm validate`.
- If a future upstream color exceeds the threshold, the gate fails the build. **Do not raise the threshold** to unblock a build — investigate.

### 5.4 JSON-safety of numeric fields

The `Oklch` record is JSON-serialized. JSON cannot represent `NaN` or `Infinity`.

- `l` is clamped to `[0, 1]`.
- `c` is clamped to `[0, 0.5]`.
- `h` is coerced to `0` when culori returns `NaN` (achromatic colors). Never let `NaN` escape `convertHexToColor`.
- All three are rounded to a documented precision (`l`/`c` to 4 decimals, `h` to 1 decimal). Precision is part of the contract; bumping it is a breaking change.

### 5.5 Determinism

- Output JSON (`themes.json`, `themes-slim.json`, `index.json`, `by-name/*.json`) MUST be byte-identical across runs given the same `.upstream-sha`. This lets CI detect regressions and lets consumers cache aggressively.
- Achieved by: sorting themes by `slug`, preserving key order in `ColorValueSchema`, fixing decimal precision in `convertHexToColor`, and generating `updatedAt` once per build (not per theme).

### 5.6 Duplicate-slug guard

Two upstream files collapsing to the same slug is a silent data-loss bug. `scripts/build.ts` MUST fail hard on duplicate slugs, emitting both filenames.

### 5.7 Classification invariants (`src/classify.ts`)

- `isDark` is derived from OKLCH lightness (`l < 0.5`), not from hex averaging.
- Tag set is bounded: `dark|light`, `vibrant|muted`, `high-contrast|low-contrast`, `popular`. Adding a new tag is a public-schema change — bump semver appropriately.
- The `POPULAR_KEYWORDS` list is a matter of taste, but it is canonical in one place. Changes to it must be reviewed as part of the classifier contract.

---

## 6. Upstream Attribution Invariants

`iTerm2-Color-Schemes` is MIT-licensed. We redistribute derivative data. These rules are non-negotiable:

- Every `TerminalColorTheme` record carries `source: 'iterm2-color-schemes'`, `sourceUrl` (permalink), and `upstreamSha`.
- `NOTICE` is published in the npm tarball. Do not remove it from `files` in `package.json`.
- `README.md` credits upstream in the Attribution section. Do not drop that section.
- If upstream license changes, the build MUST be gated until the change is reviewed against this repo's MIT license.

---

## 7. Testing Standards

### 7.1 Coverage targets

| Type                  | Target |
| --------------------- | ------ |
| Line coverage         | ≥ 80%  |
| Branch coverage       | ≥ 75%  |
| Conversion / schema   | ≥ 85%  |
| Classifier heuristics | ≥ 95%  |

Conversion and schema code is "critical path" — a bug silently ships broken
colors to every consumer. The targets above are the minimum we ship; actuals
are usually a few points higher (run `pnpm test:coverage` to see current
numbers).

### 7.2 Test structure (Vitest)

```ts
import { describe, it, expect } from 'vitest';

describe('convertHexToColor', () => {
  it('clamps chroma to [0, 0.5] for saturated reds', () => {
    // Arrange
    const hex = '#ff0000';

    // Act
    const result = convertHexToColor(hex);

    // Assert
    expect(result.oklch.c).toBeLessThanOrEqual(0.5);
    expect(result.oklch.c).toBeGreaterThanOrEqual(0);
  });

  it('coerces NaN hue (achromatic) to 0', () => {
    const result = convertHexToColor('#808080');
    expect(Number.isFinite(result.oklch.h)).toBe(true);
    expect(result.oklch.h).toBe(0);
  });
});
```

### 7.3 Required test categories

1. **Unit tests** — `src/` functions in isolation.
2. **Schema tests** — round-trip Zod parse on known-good fixtures; explicit failure cases for malformed hex, out-of-range OKLCH.
3. **Round-trip tests** — hex → OKLCH → hex ΔE2000 < 1.0 against every upstream fixture.
4. **Golden tests (optional)** — snapshot a small, stable subset of `by-name/*.json` so a regression in key order, precision, or slug generation fails loudly.

### 7.4 Fixtures

Store upstream fixture JSON under `test/fixtures/`. Do not fetch over the network from tests — CI runs with no network privileges during `pnpm test`.

---

## 8. Dependency Management

### 8.1 Stack (current)

```yaml
runtime: Node.js 22.x LTS
language: TypeScript 5.9+
package_manager: pnpm 9.x
testing: Vitest 4.x (vite 7.x)
linting: ESLint 9.x (flat config)
formatting: Prettier 3.x
validation: Zod 4.x
color_math: culori 4.x
```

### 8.2 Dependency rules

1. **Check before adding** — actively maintained? Last release < 6 months? Not deprecated? `npm view <pkg> time --json`.
2. **Runtime deps are minimal** — production `dependencies` should only include `culori`. Everything else belongs in `devDependencies`.
3. **Pin `pnpm` version** via `packageManager` in `package.json` if CI starts diverging.
4. **Audit in CI** — `pnpm audit --audit-level=high`.
5. **Prefer small single-purpose packages** over kitchen-sink.

### 8.3 Publish hygiene

- `files` in `package.json` must include `dist`, `data`, `README.md`, `LICENSE`, `NOTICE` — nothing else.
- `exports` map is the public API. Adding a new entry is a minor bump; changing/removing one is a major bump.
- Dry-run before publishing: `npm pack --dry-run`. Inspect the tarball.

---

## 9. Security Standards

This repo does not process user-supplied input at runtime (it ships static JSON). The surface area is correspondingly small, but the following still apply:

- **Secrets** — never commit tokens, API keys, or `.env` files. `.gitignore` + optional gitleaks pre-commit hook.
- **Supply chain** — `pnpm-lock.yaml` is committed and `--frozen-lockfile` is used in CI.
- **Network at build time** — the only network call is `scripts/fetch-upstream.ts` (git clone of upstream at a pinned SHA). No other build step hits the network.
- **Output sanitization** — emitted JSON is schema-validated before writing; no user input is interpolated into output strings beyond what Zod has already verified.
- **Tests must not hit the network** — offline fixtures only.
- **Dependabot** watches npm + actions weekly.

---

## 10. Quality Gates

### 10.1 Pre-commit (must pass)

- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all tests pass
- [ ] No file > 400 lines, no function > 50 lines (ESLint enforces)
- [ ] No secrets detected by gitleaks (if installed locally)
- [ ] Conventional commit format (`commitlint` via husky `commit-msg`)

### 10.2 Pre-merge (must pass)

- [ ] All pre-commit gates
- [ ] `pnpm validate` — Zod schema pass + ΔE round-trip gate + duplicate-slug guard
- [ ] Coverage meets Section 7.1 targets
- [ ] CHANGELOG entry for user-facing change
- [ ] PR scoped: < 400 lines changed, single purpose

### 10.3 Pre-release (must pass)

- [ ] All pre-merge gates
- [ ] `npm pack --dry-run` contents reviewed
- [ ] Version bump matches impact (see Section 8.3)
- [ ] NOTICE + README attribution intact
- [ ] Git tag pushed, release notes drafted

### 10.4 PR discipline

| Rule                                         | Rationale                                   |
| -------------------------------------------- | ------------------------------------------- |
| < 400 lines changed                          | Reviewable in one session                   |
| Single purpose                               | Revertable cleanly                          |
| Tests included                               | Prevents regressions                        |
| Dataset unchanged unless explicitly intended | Avoid accidental upstream bumps mid-feature |

---

## 11. Execution Protocol

### 11.1 Q Protocol (before uncertain actions)

```
DOING:  [specific action]
EXPECT: [observable outcome]
IF YES: [next step]
IF NO:  [fallback action]
```

After execution:

```
RESULT:    [what happened]
MATCHES:   yes/no
THEREFORE: [conclusion and next step]
```

### 11.2 Failure handling

When anything fails:

1. State failure — what failed + raw error.
2. State theory — why you think it failed.
3. Propose ONE specific next step.
4. State expected outcome.
5. Wait for confirmation. **No silent retries.**

### 11.3 Impact mapping

Before any change, note: what changes, what it affects (API, schema, dataset, test fixtures), migration requirements, and any remaining `Verify:` items.

---

## Appendix A: ESLint configuration

See `eslint.config.js` for the enforced ruleset. Key rules:

```js
'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
complexity: ['error', 10],
'max-params': ['error', 5],
'max-depth': ['error', 4],
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
```

## Appendix B: Why these standards differ from nexus-agents

Sections dropped as not applicable here: MCP server standards, agent/skill frameworks, consensus voting protocols, distributed systems (idempotency, clocks, observability), sandbox execution, untrusted-input trust tiers. That material is correct for nexus-agents — it is noise for a small build-and-publish library.

Sections added: Data Pipeline Standards (§5) and Upstream Attribution Invariants (§6) capture the actual invariants of this repo.

---

_Standards derived from: nexus-agents CODING_STANDARDS.md v2.2.0, CSS Color Module Level 4, TypeScript 5.9 Handbook, Node.js 22 LTS docs._
