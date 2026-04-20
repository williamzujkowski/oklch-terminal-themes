# Security Policy

## Supported Versions

The latest published `0.x` release on npm receives security updates. Older minor versions are not backported.

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅        |
| < 0.1   | ❌        |

Once the package hits `1.x`, the latest major will be supported and the prior major will receive critical-only fixes for 6 months.

## Threat model (brief)

This package ships:

- Static JSON data (`data/**`) derived from a pinned upstream commit.
- Pure TypeScript functions with no network access, no filesystem access at consumer-runtime, and no user-input processing.

Build-time risks (relevant to maintainers, not consumers):

- Upstream supply chain — `mbadolato/iTerm2-Color-Schemes`. Mitigation: pinned SHA in `.upstream-sha`, sparse clone scoped to `windowsterminal/`, Zod validation on every file.
- npm supply chain — provenance attestations (when available on npm publish), `pnpm-lock.yaml` committed, `--frozen-lockfile` in CI, Dependabot weekly.

Runtime risks for consumers (importing the package):

- Minimal. The package is pure data + pure functions. No `eval`, no dynamic `require`, no network, no filesystem I/O.

## Reporting a Vulnerability

**Please do not file public GitHub issues for security reports.**

Instead, report privately via one of:

- **Preferred:** [GitHub private security advisory](https://github.com/williamzujkowski/oklch-terminal-themes/security/advisories/new)
- Email: <grenlan@gmail.com> — use subject line `[security] oklch-terminal-themes: <brief>`

Include:

- A description of the issue and its impact.
- Steps to reproduce (minimal example preferred).
- Affected versions, if known.
- Any mitigation you've identified.

### What to expect

- Acknowledgment within 72 hours.
- Initial assessment within 7 days.
- A fix or a disclosure timeline within 30 days for confirmed issues.
- Public disclosure after a fix is released, with credit to the reporter unless they prefer anonymity.

### Out of scope

- Theoretical vulnerabilities without a reproducible proof of concept.
- Issues in upstream `mbadolato/iTerm2-Color-Schemes` that do not affect our derived dataset — please report those upstream directly.
- Issues in `culori` or other dependencies — please report those to their respective maintainers. We will track advisories via Dependabot and cut a patched release when a fix is available.

## Hardening already in place

- `pnpm audit --audit-level=high` in CI.
- Dependabot weekly for npm and GitHub Actions.
- OpenSSF Scorecard workflow publishing results to the badge and security tab.
- CodeQL workflow for JavaScript/TypeScript.
- GitHub Actions pinned by commit SHA (not by tag) to prevent tag-move attacks.
- Gitleaks secret scanning in CI (`.github/workflows/gitleaks.yml`) and pre-commit husky hook.
- `pnpm.overrides` pins patched versions of transitive advisories (see `package.json`).

## Scorecard checks — intentionally deferred

A handful of [OpenSSF Scorecard](https://securityscorecards.dev/) checks are intentionally not being
chased to a perfect score. Rationale documented here so the alerts don't cycle through "open →
someone investigates → someone else re-opens" on every Scorecard run.

### FuzzingID — project is not fuzzed

**Deferred.** This is a pure data-conversion library with no untrusted-input parser surface worth
fuzzing. The build pipeline already exercises every upstream theme file end-to-end through a strict
Zod schema plus a hex → OKLCH → hex round-trip gate with ΔE2000 < 1.0 assertion. Fuzzing would
test the same functions with random inputs that the Zod schema would reject before reaching
conversion. See [CODING_STANDARDS.md §5](./CODING_STANDARDS.md#5-data-pipeline-standards-oklch-specific).

Reference: [Scorecard Fuzzing check](https://github.com/ossf/scorecard/blob/main/docs/checks.md#fuzzing)

### CIIBestPracticesID — no OpenSSF Best Practices badge

**Deferred.** The [OpenSSF Best Practices badge](https://www.bestpractices.dev/) is a community
self-certification requiring governance processes (code of conduct enforcement history, security
disclosure drills, public release process) disproportionate to a one-maintainer data-conversion
library. Will revisit on GA (1.0) or on sustained external contribution.

Reference: [Scorecard CII-Best-Practices check](https://github.com/ossf/scorecard/blob/main/docs/checks.md#cii-best-practices)

### MaintainedID — repo created within the last 90 days

**Self-resolving.** This check looks at commit / issue activity over a 90-day trailing window.
The repo was created in April 2026; the alert closes automatically once enough history accumulates.
No action required.

Reference: [Scorecard Maintained check](https://github.com/ossf/scorecard/blob/main/docs/checks.md#maintained)

### CodeReviewID — 0 of 11 approved changesets

**Self-resolving for solo projects.** The metric expects most commits to land via reviewed PRs.
A single-maintainer project can't satisfy this without asking external reviewers to rubber-stamp
changes they haven't context-shopped for. Metric improves naturally as external contributors
review and approve PRs. All administrative merges by the owner bypass this check by design.

Reference: [Scorecard Code-Review check](https://github.com/ossf/scorecard/blob/main/docs/checks.md#code-review)
