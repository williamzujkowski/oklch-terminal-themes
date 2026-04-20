# Releasing

Version bumps are cut as a git tag. The `Release (npm)` workflow runs on tag push, builds the dataset + TypeScript, and publishes to npm via **Trusted Publishing** (OIDC). No `NPM_TOKEN` secret is required.

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
