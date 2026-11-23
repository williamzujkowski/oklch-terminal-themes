# Live theme showcase

GitHub Pages theme picker for [`@williamzujkowski/oklch-terminal-themes`](..).

Built with [Astro](https://astro.build/); `package.json` defines the current version.
Deployed to https://williamzujkowski.github.io/oklch-terminal-themes/.

The main Browse page opens one theme and shows all five visual examples as you
scroll: terminal, editor, webpage, dashboard and charts. The familiar searchable
picker, previous/next and random controls update every example together.
Palette and contrast information follow the previews in closed disclosures.

The separate `/compare/` page starts with two terminals showing identical
content. A (reference) stays fixed as B (candidate) changes. Reference selection,
pin and swap remain visible; other previews, typography, mapping and role
inspection live in **Preview settings** below the pair. Direct Compare visits
use Dracula/Nord; links from Browse carry the selected theme. Existing root
links with `ref` redirect to Compare with their search and fragment preserved.
The outer page has an independent light/dark toggle. Read
[Choosing a theme](../docs/CHOOSING_A_THEME.md) for controls and measurement limits.

## Dev

```bash
# From repo root
pnpm install
pnpm build:ts
pnpm --filter @williamzujkowski/oklch-terminal-themes-site dev
```

Use the committed `data/` for site-only work. `build:ts` prepares the workspace
package imported by Astro; a fresh clone does not contain `dist/`. Open the dev
server URL with the configured `/oklch-terminal-themes/` base path.

## Build and verify

```bash
pnpm --filter @williamzujkowski/oklch-terminal-themes-site build
pnpm --filter @williamzujkowski/oklch-terminal-themes-site typecheck
pnpm --filter @williamzujkowski/oklch-terminal-themes-site test
pnpm --filter @williamzujkowski/oklch-terminal-themes-site test:selectors
pnpm --filter @williamzujkowski/oklch-terminal-themes-site test:a11y
```

The selector and axe tests read both built routes, so build first. Root
`pnpm test` does not run these site suites. Root `pnpm lint` also checks the
site's TypeScript. See `.github/workflows/ci.yml` and `lighthouse.yml` for the
full CI checks; a passing structural accessibility test is not proof that every
previewed theme has sufficient rendered contrast.

Output is in `site/dist/`. `pnpm --filter @williamzujkowski/oklch-terminal-themes-site preview`
serves that build. `.github/workflows/pages.yml` deploys the site to GitHub Pages.

## Where changes belong

| Change                                                       | Location                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Page layout and initial dataset bootstrap                    | `src/pages/index.astro`, `src/pages/compare.astro`, `ShowcasePage.astro` |
| Terminal, IDE, reading, dashboard, palette, or chart example | Matching `src/components/Showcase*.astro`                                |
| Shared preview styles and color variables                    | `src/components/Showcase.astro`                                          |
| Picker markup                                                | `src/components/ThemeSelector.astro`                                     |
| URL state and controller lifecycle                           | `src/lib/showcase-controller.ts`                                         |
| Data loading and active slug resolution                      | `src/lib/theme-store.ts`                                                 |
| Filtering and sorting                                        | `src/lib/theme-filter.ts`, `src/lib/theme-listbox.ts`                    |
| Applying colors and announcing selections                    | `src/lib/theme-paint.ts`                                                 |
| Clipboard actions and serialized formats                     | `src/lib/theme-clipboard.ts`, `src/lib/formatters.ts`                    |
| Preview payload projection                                   | `src/lib/theme-data.ts`, `src/pages/themes-data.json.ts`                 |

When changing selectors, update `test/showcase-selectors.test.ts` and
`test/fixtures/showcase-dom.ts` together. When changing a preview, inspect the
actual built page with dark, light, muted, saturated, and low-contrast themes,
including keyboard navigation and a narrow viewport. Keep preview colors under
the `--tt-*` variables so selecting a theme updates every intended element.

## State, data and measurement boundaries

`explorer-state.ts` normalizes catalog-backed identities and shared presentation
state. `theme-store.ts` retains the compact picker payload; `theme-details.ts`
validates full active-theme records, caches successful responses and deduplicates
pending requests. `src/pages/theme-data/[slug].json.ts` emits one static complete
record per committed theme under the configured base path. No upstream request
is needed to serve those records, and a failed request remains retryable.

`specimen-roles.ts` and `application-roles.ts` define source roles and versioned
application mappings. Rendering and inspection share these definitions;
`role-metrics.ts`, `theme-summary.ts` and `role-inspector.ts` distinguish exact
canonical hex metrics from actual resolved CSS measurements. `resolved-colors.ts`
resolves supported solid backing chains in an explicitly sRGB canvas;
`contrast-sample.ts` returns conservative bounds for eight-bit samples.

Keep URL/event ownership in the controller and pane painting scoped to its own
root. Repaint role diagnostics after theme, mapping, specimen or typography
changes; discard stale asynchronous results. Load full records for active panes
instead of placing every record in the picker payload. Test raw source metrics
and rendered CSS diagnostics independently, including unsupported surfaces and
near-threshold indeterminate results.

The application entry is `comparison-controller.ts`; its controls, scoped pane
painting and asynchronous effects live in `comparison-controls.ts`,
`comparison-preview.ts` and `comparison-effects.ts`. `ComparisonWorkspace.astro`
composes the two panes. `shortlist-store.ts` validates a bounded versioned local
record, while `shortlist-ui.ts` exposes candidate/reference actions without
owning history. Theme-only sharing omits presentation and browse state;
comparison sharing includes shared presentation but excludes browse/private URL
context. Use `test/comparison-controller.test.ts` for real-controller two-pane
race, history, retry, shared-state and clipboard regressions.

Layout decisions and the usability findings are recorded in
[the showcase UX review](../docs/SHOWCASE_UX_REVIEW.md). `page-state.ts` keeps
Browse normalization and navigation separate from comparison presentation.
Sample responsiveness uses container widths where two panes can be narrower
than the viewport. Check expanded disclosures and 18px text as well as defaults.
