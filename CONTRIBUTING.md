# Contributing to oklch-terminal-themes

Thanks for your interest. This guide covers development setup, coding standards, and the contribution workflow.

For a quick orientation to the repo, read **[AGENTS.md](./AGENTS.md)** first. For the full coding standards (enforced by CI), read **[CODING_STANDARDS.md](./CODING_STANDARDS.md)**.

---

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md). In short: be respectful, assume good faith, keep it constructive.

---

## Development setup

### Prerequisites

| Tool    | Version  | Purpose         |
| ------- | -------- | --------------- |
| Node.js | 22.x LTS | Runtime         |
| pnpm    | 9.x      | Package manager |
| Git     | Recent   | Version control |

Verify:

```bash
node --version   # v22.x.x
pnpm --version   # 9.x.x
```

### Clone and install

```bash
git clone https://github.com/williamzujkowski/oklch-terminal-themes.git
cd oklch-terminal-themes
pnpm install
```

Install pre-commit hooks (Husky runs automatically via the `prepare` script on `pnpm install`).

### Build + test commands

```bash
# Full build pipeline (fetch → convert → validate → compile TS)
pnpm build

# Individual steps
pnpm tsx scripts/fetch-upstream.ts   # sparse-clone upstream at pinned SHA
pnpm build:data                      # emit data/*.json
pnpm validate                        # Zod + ΔE round-trip + duplicate-slug guard
pnpm build:ts                        # compile src/ → dist/

# Quality gates
pnpm lint
pnpm typecheck
pnpm test
pnpm test:watch

# Weekly upstream sync (same thing CI runs)
pnpm update
```

---

## Development workflow

### Branch naming

| Prefix      | Use case           | Example                         |
| ----------- | ------------------ | ------------------------------- |
| `feat/`     | New features       | `feat/add-pastel-tag`           |
| `fix/`      | Bug fixes          | `fix/achromatic-hue-nan`        |
| `docs/`     | Documentation      | `docs/update-schema-example`    |
| `refactor/` | Refactoring        | `refactor/extract-contrast`     |
| `test/`     | Tests              | `test/add-classifier-snapshots` |
| `chore/`    | Maintenance / deps | `chore/bump-culori-4.1`         |

Include the issue number when one exists: `fix/42-hex-lowercase`.

### Commit messages — Conventional Commits

Enforced by `commitlint` via a Husky `commit-msg` hook. Format:

```
type(scope): description

[optional body]

[optional footer]
```

Allowed types: `feat | fix | refactor | docs | test | chore | perf`.

Examples:

```
feat(classify): add "pastel" tag for low-chroma light themes
fix(convert): coerce NaN hue for achromatic colors
docs(readme): document themes-slim.json shape
chore(deps): bump culori 4.0 → 4.1
```

Keep the subject ≤ 100 characters. Body and footer may wrap naturally.

### PR process

1. **Create a branch** from latest `main`:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/short-description
   ```

2. **Write a failing test first**, then the production change. See `CODING_STANDARDS.md` §7.

3. **Run quality gates** locally:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm validate
   ```

4. **Push and open a PR**:

   ```bash
   git push -u origin feat/short-description
   gh pr create
   ```

5. **Keep PRs scoped**: < 400 lines changed, single purpose, tests included. Larger PRs will be asked to split.

6. **Address review**, ensure CI is green, merge as squash (maintainer will merge).

---

## Code quality standards

All contributions MUST adhere to [CODING_STANDARDS.md](./CODING_STANDARDS.md). Highlights:

### Hard limits (enforced by ESLint)

| Metric                  | Limit     |
| ----------------------- | --------- |
| File length             | 400 lines |
| Function length         | 50 lines  |
| Cyclomatic complexity   | 10        |
| Parameters per function | 5         |
| Nesting depth           | 4 levels  |

### TypeScript

- `strict` mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **No `any`.** Use `unknown` + Zod / type guards
- Zod at every I/O boundary (upstream JSON in, dataset JSON out)
- Types in `src/types.ts`, schemas in `src/schema.ts`

### Pipeline invariants (§5 of CODING_STANDARDS.md)

Do not break these without an explicit user-facing decision:

- Pinned upstream SHA in every record
- ΔE2000 < 1.0 round-trip gate
- JSON-safe numerics (clamp L/C, coerce NaN hue to 0)
- Deterministic output (sorted, fixed precision)
- Duplicate-slug guard

### Quality gates

- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm validate` — passes (when touching pipeline or data)
- [ ] Commit messages follow Conventional Commits

---

## Testing

### Coverage targets

| Type                  | Target |
| --------------------- | ------ |
| Line coverage         | ≥ 80%  |
| Branch coverage       | ≥ 75%  |
| Conversion & schema   | ≥ 85%  |
| Classifier heuristics | ≥ 95%  |

Current (per `pnpm test:coverage`): line 96%, branch 87%, `convert.ts` 87%/91%
statements/lines, `classify.ts` 97%/98% statements/lines.

### Test structure

Vitest, `describe` / `it`, arrange / act / assert:

```ts
import { describe, it, expect } from 'vitest';
import { convertHexToColor } from '../src/convert.js';

describe('convertHexToColor', () => {
  it('coerces NaN hue to 0 for achromatic grey', () => {
    const result = convertHexToColor('#808080');
    expect(Number.isFinite(result.oklch.h)).toBe(true);
    expect(result.oklch.h).toBe(0);
  });
});
```

### Test rules

- **No network in tests.** Fixtures live in `test/fixtures/`.
- **Cover the ΔE round-trip** against representative upstream hex values.
- **Cover edge cases**: achromatic colors, pure black, pure white, out-of-gamut.

---

## Documentation

Update documentation when you:

- Change the public API (`src/index.ts` exports)
- Change the dataset schema (`src/schema.ts`, `src/types.ts`)
- Change build-pipeline behavior (scripts/)
- Add/remove/change an exported path in `package.json` `exports`

Keep `README.md` usage examples accurate. Use JSDoc sparingly — names should carry intent; comments explain _why_, not _what_.

---

## Issue reporting

### Before creating an issue

1. Search existing issues.
2. Verify on latest `main`.
3. Have a minimal reproduction.

### Bug reports

Use the bug report template. Include: Node version, pnpm version, OS, reproduction steps, expected vs actual behavior. For dataset bugs, include the theme slug and the specific color key.

```bash
gh issue create --title "fix: <brief>" --label bug
```

### Feature requests

Use the feature request template. Describe the use case, the proposed shape, and what alternatives you considered.

```bash
gh issue create --title "feat: <brief>" --label enhancement
```

---

## Security

If you find a security vulnerability, do **not** open a public issue. See [SECURITY.md](./SECURITY.md) for disclosure.

---

## Recognition

Contributors are credited in release notes.

---

_Last updated: 2026-04-20 (ET)_
