# Releasing

Version bumps are cut as a git tag. The `Release (npm)` workflow runs on tag push, builds the dataset + TypeScript, publishes to npm via **Trusted Publishing** (OIDC), and creates a GitHub Release with auto-generated categorised notes. No `NPM_TOKEN` secret is required.

## Conventions

The repo follows [Semantic Versioning 2.0](https://semver.org/) and [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/). Commit / PR title prefixes drive both the version bump and the release-notes categorisation:

| Prefix                                       | Semver bump                  | Release-notes section          |
| -------------------------------------------- | ---------------------------- | ------------------------------ |
| `feat:`                                      | minor                        | ✨ New Features                |
| `fix:`                                       | patch                        | 🐛 Bug Fixes                   |
| `perf:`                                      | patch                        | ⚡ Performance                 |
| `refactor:`                                  | patch (no public-API change) | ♻️ Refactoring                 |
| `docs:`                                      | patch                        | 📚 Documentation               |
| `test:`                                      | patch                        | 🧪 Tests & CI                  |
| `chore:` / `ci:` / `build:`                  | patch or no release          | 🔧 Maintenance / 🧪 Tests & CI |
| _any_ with `!:` or `BREAKING CHANGE:` footer | **major**                    | ⚠️ Breaking Changes            |

A Dependabot-raised PR lands under 📦 Dependencies. Anything else falls under 📝 Other Changes.

The `.github/workflows/pr-auto-label.yml` workflow reads the PR title and applies the matching label automatically when the PR is opened, edited, or re-synchronised — the GitHub Release notes are then grouped by those labels via `.github/release.yml`.

Commit messages themselves are validated by commitlint via a husky `commit-msg` hook and by the `Commit Messages` CI job on PRs.

## One-time npm setup

Before the first publish, configure npm to trust this repo's release workflow:

1. Sign in at <https://www.npmjs.com/>.
2. Open **Access Tokens → Trusted Publishers → Add Trusted Publisher** (or visit <https://www.npmjs.com/trusted-publishers/new>).
3. Fill in:

   | Field             | Value                                     |
   | ----------------- | ----------------------------------------- |
   | Publisher         | `GitHub Actions`                          |
   | Organization/User | `williamzujkowski`                        |
   | Repository        | `oklch-terminal-themes`                   |
   | Workflow filename | `release.yml`                             |
   | Environment       | _(leave blank)_                           |
   | Package name      | `@williamzujkowski/oklch-terminal-themes` |

4. Save. The package doesn't need to exist yet — npm will trust the workflow to claim the name on its first publish.

That's it. You'll never need to generate or rotate an npm automation token.

## Cutting a release

```bash
# 1. Pull latest main
git checkout main && git pull

# 2. Bump the version in package.json. Pick the kind of bump intentionally:
#    - patch for fixes and internal cleanup
#    - minor for new features + new data columns (485 themes is expected to drift)
#    - major for breaking public API changes (exports, schema, color keys)
pnpm version patch   # or minor / major — updates package.json + creates the tag

# 3. Push the branch + the tag
git push origin main
git push origin "v$(jq -r .version package.json)"
```

The `Release (npm)` workflow fires on the tag push. Watch it via
`gh run watch --repo williamzujkowski/oklch-terminal-themes` or
<https://github.com/williamzujkowski/oklch-terminal-themes/actions/workflows/release.yml>.

When it finishes, both things are in place:

1. **npm** — `npm view @williamzujkowski/oklch-terminal-themes` shows the new version with provenance attestation.
2. **GitHub Release** — `gh release view vX.Y.Z` shows release notes grouped by Conventional Commit category (see the table at the top of this file). The `[Unreleased]` block in `CHANGELOG.md` should be renamed to the new version + dated; future entries go under a new `[Unreleased]` block. The auto-generated GitHub release notes are a terse per-release diff; `CHANGELOG.md` is the curated cumulative narrative.

## Provenance

Every publish carries an [npm provenance](https://docs.npmjs.com/generating-provenance-statements) attestation tying the tarball to the exact commit SHA on GitHub. Consumers can verify it with:

```bash
npm audit signatures
```

## Pre-release checklist

The workflow itself runs `lint + typecheck + test + build:data + validate + build:ts` before publish, so a clean `main` is usually sufficient. For the first release specifically:

- [ ] `package.json` `version` reflects the intended release.
- [ ] `CHANGELOG.md` `[Unreleased]` section has been renamed to the new version and dated.
- [ ] `npm pack --dry-run` locally shows the expected files (`dist/`, `data/`, `README.md`, `LICENSE`, `NOTICE`).
- [ ] Trusted Publisher is configured on npm per the one-time setup above.

## Troubleshooting

**`npm ERR! 401 Unauthorized`** — Trusted Publisher isn't configured (or the workflow filename / repo slug doesn't match). Re-check the setup; npm is case-sensitive about the workflow filename.

**`npm ERR! 403 Forbidden`** — the package is already claimed by another account, or the package name differs from the Trusted Publisher's package field.

**`npm ERR! insufficient scope`** — npm CLI on the runner is older than 11.5.1. The workflow upgrades npm before publish for this reason; verify the `Upgrade npm for Trusted Publishing support` step ran.
