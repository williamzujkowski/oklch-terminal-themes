# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — README examples that could not work

- **The Tailwind v4 example was not valid syntax** (#186). `@import '…/dracula.json' as json;` — there is no `as json` at-rule in CSS or Tailwind, and CSS cannot import JSON at all, so the `@theme` block below it referenced `--terminal-*` properties nothing had defined. Now imports the theme's static CSS, which does define them.
- **The lazy-load example produced a silently broken browser bundle.** A template literal in a dynamic `import()` cannot be statically analysed, so Vite emits the bare specifier **unresolved** into the output with no warning and it throws at runtime — verified with a real Vite build. Replaced with three forms that work: `import.meta.glob` for bundlers, `fetch` from a CDN for no-build browsers, and the dynamic specifier for Node.
- **JSON imports now show `with { type: 'json' }`.** The package is ESM-only, and Node refuses a JSON import without it (`ERR_IMPORT_ATTRIBUTE_MISSING`); TypeScript reports `TS1543` under `module: NodeNext`. Every JSON example was previously unrunnable as written.
- **A worked value was wrong.** `dark[0].colors.background.oklchCss` was documented as `oklch(0.231 0.016 264.1)`; the actual first dark theme is `0x96f` at `oklch(0.264 0.006 314.7)`.
- **Added Astro and Svelte sections.** Both are named in the package description and in the README's own opening line, and neither had an example.

Every corrected example was executed rather than eyeballed.

### Fixed — `scripts/` and `test/` are now typechecked (#269)

`tsconfig.json` is the build project: `rootDir: "src"`, emits `dist/`, and excludes `scripts`/`test` so they stay out of the published package. The side effect was that neither was typechecked by anything — `pnpm typecheck` was a bare `tsc --noEmit`, which picks up `tsconfig.json` and therefore checked exactly the same files as the build. Since `tsx` strips types rather than checking them, the entire build and validation pipeline ran unverified.

New `tsconfig.check.json` covers `src/` + `scripts/` + `test/` with `noEmit`, and `pnpm typecheck` now points at it. Kept separate rather than widening `tsconfig.json`, because pulling `scripts/` into the build project would change `rootDir` and therefore the emitted `dist/` layout. No workflow change was needed — CI, the `ci-success` gate and `release.yml` already ran `pnpm typecheck`; it simply has teeth now.

`types: ["node"]` is set explicitly. Without it the automatic `@types` inclusion did not apply to this project and every `node:*` import failed to resolve, burying the real errors under 20+ spurious ones.

The gate found two genuine errors on first run, both in code added by #268 and neither reachable before: a double cast missing in `test/assemble.test.ts` (`SlimTheme` has no index signature, so casting straight to `Record<string, unknown>` is a TS2352). The `scripts/build.ts` error that motivated this issue — a half-built theme literal annotated as a complete `TerminalColorTheme` — is fixed in #268 itself.

### Changed — build pipeline units extracted from `scripts/build.ts` and tested (#175)

`scripts/build.ts` was 506 lines at 0% coverage, and the policy it encodes was unreachable from a test because it was welded to `readdirSync`/`readFileSync`. Split into two pure modules under `src/` (build tooling, deliberately not re-exported from `src/index.ts`, matching `src/counterpart.ts`):

- **`src/assemble.ts`** — `assembleTheme` / `buildTheme` / `buildNativeTheme` / `toSlim` / `nameFromFilename`. The `local: true → main` vs SHA-pinned permalink rule, the omit-`oklchAuthored`-when-empty convention, and the published `themes-slim.json` shape.
- **`src/collect.ts`** — `selectSourceFiles` (incl. the extension-less ghostty branch), `collectFromSource`, `parsePreviousThemes`, `parsePreviousIndex`. File access is injected via a `SourceReader` interface so the slug-collision policy — same-source duplicate is a hard failure, cross-source duplicate is a logged drop with the first source in `sources.json` winning — can be exercised with in-memory fixtures. That precedence decides which project's "Dracula" ships and had no test at all.

`scripts/build.ts` drops to 316 lines and keeps only I/O, wiring, and the build summary. Output is byte-identical: a full rebuild of all 633 themes and every export artifact produces zero diff.

**Behaviour changes**, both in the previous-state loading that `updatedAt` preservation (#140) depends on:

- An unreadable previous theme record is now **reported** instead of silently swallowed by a bare `catch {}`. Each one re-stamps its theme's `updatedAt`, so the old failure mode was invisible except as an inexplicably large nightly sync diff.
- A previous record that is valid JSON but has no string `slug` is now rejected. It previously keyed the map under `undefined`, letting one stray non-theme JSON file shadow a real record.

`classifyTheme` is now declared as an assertion (`asserts theme is TerminalColorTheme`) over a new exported `ClassifiableTheme` input type, making the "derives `isDark`/`contrast`/`tags`" contract compiler-checked. This is a widening — callers passing a complete theme are unaffected. It surfaced immediately on extraction: `scripts/` is excluded from `tsconfig.json`, so `build.ts` had never been typechecked and its half-built theme literal was annotated as a complete `TerminalColorTheme` with a `contrast` that did not exist yet.

New `test/assemble.test.ts` (19 tests) and `test/collect.test.ts` (21 tests), verified against six mutations of the extracted policy — inverted collision precedence, dropped `local` handling, dropped key-order seed, unconditional `oklchAuthored`, restored silent `catch {}`, inverted ghostty branch — each caught.

### Changed — no source maps in the tarball (#184)

`dist/**/*.map` shipped 48 files that could not work for a consumer: `sources` pointed at `../src/*.ts`, `src/` is not in `files`, and `sourcesContent` was absent, so every map referenced files the installer does not have. Nothing in this repo consumed them either — the site imports only the JSON subpaths, and tests run against `src/` directly.

`sourceMap` and `declarationMap` are now off, so they are not emitted at all rather than emitted and then filtered out of the tarball. That also removes the 48 dangling `//# sourceMappingURL=` comments that excluding the files alone would have left behind.

`npm pack --dry-run`: **2,639 → 2,587 files**, 14.55 → 14.45 MB unpacked. The issue estimated 208 KB; the real figure is ~88 KB.

Verified by packing, installing into a clean directory with `--omit=dev`, and resolving `./css/*.css`, `./schemes/*.yaml`, `./themes/*.json` and `./index.json` — all fine, `dist/index.d.ts` present, zero `.map` files installed.

**The issue's largest action was deliberately not taken.** It proposed dropping `data/css/` and `data/schemes/` from `files` (−1,899 files, −7.6 MB) _or_ adding their `exports` subpaths, explicitly "pick one; don't do both". The subpaths were added, so those directories are now reachable and must stay in the tarball.

### Added — TypeScript declarations for the JSON subpaths

- **JSON imports are now assignable to the package's own exported types** (#185). Previously TypeScript inferred the shape from the literal and widened every union member to its base type, so `contrast.minAnsiSlot` came out as `string` rather than `ColorKey` and the import was **not assignable** to `TerminalColorTheme[]`. Consumers had to write `as unknown as TerminalColorTheme[]` — casting away the very types the package exports.
- `./themes.json`, `./themes-slim.json`, `./index.json` and `./themes/*.json` now carry a `types` condition pointing at declarations in `types/`. One declaration serves all 633 per-theme files: the `types` condition is fixed while `default` keeps the `*` wildcard, so no 633-file `.d.ts` sprawl.
- Declaring the shape also means TypeScript **never infers over the 5.8 MB literal**, which is the larger cost on a file that size.
- The declarations live in `types/` rather than `data/` so the dataset build cannot disturb them, and `types` is added to `files`.

The declarations immediately caught two latent bugs in this repo's own site, both previously masked by the inferred literal type: `BaseLayout.astro` used `import { count } from '…/index.json'`, a **bundler-only extension** that Node ESM rejects outright (`does not provide an export named 'count'`), and `ThemeSelector.astro` dereferenced the optional `apca` field without a guard. Both are fixed.

Verified against a real packed tarball installed with `--omit=dev`: all four imports typecheck as their exported types, `ColorKey` narrows properly, and every subpath still resolves the JSON at runtime.

### Added — `./css/*` and `./schemes/*` subpath exports

- **`data/css/` and `data/schemes/` are now importable by package specifier** (#183). They shipped in the tarball but had no `exports` entry, so 1,899 files — **72% of the tarball's file count** — were reachable only via jsDelivr, and `import '@…/css/dracula.css'` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The v0.7.0 headline feature (zero-JS `<link>` consumption) could not be consumed the ordinary way.
- **Added a `default` condition** to the `.` entry. With only `types` + `import`, Metro, some Webpack 4 configs and any non-Node condition fell through to `main` by luck or failed outright.
- **`./package.json` is now exported.** Blocking it breaks tooling that reads it, for no benefit.
- **`./themes/*` is now `./themes/*.json`.** Behaviour is unchanged — `./themes/dracula` never resolved — but the pattern now says so rather than leaving it to be discovered.
- **README documents that the package is ESM-only.** `"type": "module"` with no CJS build means `require()` fails with `ERR_REQUIRE_ESM`, which was not stated anywhere.

Verified against a real packed tarball installed with `--omit=dev`: all nine subpaths resolve, and `./dist/index.js` is still correctly blocked, so the map has not been loosened into a passthrough.

Note `data/css` and `data/schemes` stay in the tarball. Trimming them (#184) was the alternative fix for the same finding; keeping them importable was chosen instead, so the currently-documented jsDelivr npm URLs continue to work.

### Fixed — the a11y gate now reads axe's `incomplete` bucket (#209)

`site/test/a11y.test.ts` filtered `results.violations` and discarded everything else, so a rule axe declined to decide vanished silently. Three of the bugs fixed in #208 and #216 landed in `incomplete` rather than `violations` — jsdom cannot resolve visibility — and the gate stayed green through all of them.

- **`incomplete` now fails the build**, unless the rule is on a documented exemption list carrying the reason and the structural test that covers it instead. Only three qualify: `color-contrast` (jsdom does not lay out or compute rendered colour, and axe cannot parse `oklch()` — #266), `landmark-one-main` and `page-has-heading-one` (visibility, both covered deterministically by the #216 guards).
- **The exemption list cannot rot.** A test fails if a listed rule stops being incomplete, so an entry cannot outlive the limitation that justified it. Migrating to a real-browser gate should empty the map.
- **Four rules were never being run at all.** `landmark-one-main`, `page-has-heading-one`, `heading-order` and `region` carry the `best-practice` tag, not `wcag2a`/`wcag2aa`, so the previous scope skipped them entirely — they were absent from every bucket rather than incomplete. `best-practice` is now included, and a test asserts the structural rules were genuinely evaluated rather than silently skipped.
- axe now runs **once** in `beforeAll`, shared across assertions, so the added checks cost nothing. The suite is 10 tests in ~10s.

Verified by reintroducing the #208 anchor: the gate that previously passed green now fails with `aria-hidden-focus: ARIA hidden element must not be focusable`. Also verified by narrowing the tag scope back (catches the unrun rules) and by adding a bogus exemption (catches staleness).

**Not addressed here:** running axe in a real browser, which is #238's open decision, and the `<script>` strip that keeps dynamically-rendered state out of the gate entirely.

### Fixed — heading structure and a skip link (#216)

- **Two `<h1>` elements.** The showcase theme name was an `h1` alongside the page title, and it renders as a bare em-dash before JS runs — a no-JS reader or crawler saw a top-level heading containing nothing but punctuation. Demoted to `h2`, with the five preview sections re-levelled to `h3` beneath it so the outline nests correctly.
- **A skipped heading level, found while re-levelling.** `Dashboard` was an `h2` whose panels were `h4`. The demotion fixes it as a side effect: `Dashboard` is now `h3` and its panels stay `h4`.
- **No skip link.** `<main>` had no id and there was no skip link anywhere in the built output, so a keyboard user traversed a combobox, 13 tag chips, a sort select and the prev/next/random controls before reaching content. Added `<a href="#main" class="skip-link">` as the first body child and `id="main"` on `<main>`. It is translated off-canvas rather than `display: none`, since a hidden element cannot be focused.

Five guards in `site/test/a11y.test.ts` cover exactly one `h1`, no skipped levels, a skip link whose target exists, the skip link being first in the tab order, and one `main` landmark. Verified against four mutations — restoring the second `h1`, reintroducing the Dashboard skip, deleting the skip link, and pointing it at a missing id — each caught.

This was blocked by #238 until the listbox sampling landed: the skip link alone previously consumed 21 of the axe gate's 30 available seconds. The full suite now runs in ~10s.

### Fixed — focusable links inside an `aria-hidden` subtree (#208)

`ShowcaseReading` marked its whole article `aria-hidden="true"` while containing two real `href="#"` anchors. They stayed in the tab order while being invisible to assistive tech, so a keyboard user tabbed into an element that reports no accessible name (WCAG 4.1.2, axe _serious_).

Both are now `<span class="mock-link">`, keeping the link colouring that is the reason they exist. They are decorative preview copy and never navigated anywhere.

A structural guard in `site/test/a11y.test.ts` asserts no tabbable element sits inside any `aria-hidden` subtree. It is deliberately not axe-driven: axe reports this pattern as `incomplete` rather than a violation because jsdom cannot resolve visibility, and the axe run still passes with the bug reintroduced — verified by putting one anchor back, which the new guard catches and axe does not.

### Changed — the jsdom axe gate samples the listbox (interim, #238)

Fixing #208 pushed the axe run from ~12s to **286s**, past its 30s timeout. Measured on one machine against the built page:

| configuration                                 | axe run  |
| --------------------------------------------- | -------- |
| full listbox, #208 unfixed                    | ~12s     |
| full listbox, #208 fixed with `<span>`        | 286s     |
| full listbox, #208 fixed with `tabindex="-1"` | 320s     |
| listbox truncated to 20, #208 fixed           | **1.1s** |

Both shapes of the fix hit the cliff, so the fix could not be reshaped around it — #238 had only measured the first. The gate now truncates the listbox to 20 options before running axe, which also makes it 10x faster than the unmodified baseline.

**This is an interim measure, not a resolution of #238**, which still wants axe running in a real browser — where these rules also stop landing in the `incomplete` bucket. The coverage cost is small (every option comes from one loop with identical markup, and the swatches are `aria-hidden`), but it does give up any bug that only appears at scale.

### Changed — Lighthouse CI now measures the real site (#218)

**The Lighthouse job was never auditing the built site.** The site is built with `base: '/oklch-terminal-themes'`, so every asset URL in the HTML carries that prefix — but `staticDistDir: "./site/dist"` serves that directory at the server _root_, so every stylesheet and script 404'd. Lighthouse audited an unstyled, script-less page, locally and in CI, for as long as the job existed.

Caught by accident: adding `min-block-size: 24px` to every button changed nothing, and neither did 60px — byte-identical measurements in both runs. CSS that cannot change a measurement is CSS that never loaded. The workflow now stages `dist` under the base segment so the URLs resolve.

|                  | broken harness | real page          |
| ---------------- | -------------- | ------------------ |
| performance      | 100            | **98**             |
| accessibility    | 92             | 92                 |
| best-practices   | 96             | **100**            |
| `target-size`    | FAIL, 11 nodes | **PASS**           |
| `color-contrast` | pass           | **FAIL, 34 nodes** |

With that fixed, the #218 changes are:

- **Performance is `error` at 0.8**, was `warn`. The real page scores 98, so the threshold has genuine headroom.
- **Mobile is measured.** Mobile is Lighthouse's _default_ emulation, not a preset — `preset: "mobile"` is rejected (`Choices: perf, experimental, desktop`) — so the mobile config omits `preset`. Both run as a workflow matrix.
- **`color-contrast` stays `off`**, on evidence rather than assumption: all **34** failing nodes are inside the showcase or picker (the previewed themes, deliberately low-contrast) and **zero** are site chrome. Lighthouse cannot scope an audit to a subtree, so the issue's `.showcase`-only exception is not expressible — and is unnecessary.

Two regression guards: `test/lighthouse-config.test.ts` pins that the two configs differ only in `preset` and that neither serves dist at the server root; `site/test/showcase-selectors.test.ts` asserts every asset URL the built page references resolves to a real file once the base prefix is stripped — the invariant that broke.

Corrections to filed issues, all from real measurements: #266's "7 real contrast failures" and "the assert block is decorative" are both wrong, and #280 (`target-size`, which I filed on the broken harness) is retracted and closed. The 24px touch-target CSS added while chasing #280 is removed too — the real page passes `target-size` without it, so it was styling added to fix a phantom.

### Performance — the theme dataset is no longer inlined (#211)

`index.astro` inlined all 633 slim themes. The blob was HTML-parsed and then `JSON.parse`d on the main thread before anything was interactive, to render one theme.

|                            | before      | after         |
| -------------------------- | ----------- | ------------- |
| `dist/index.html`          | 1,690,905 B | **906,885 B** |
| gzip                       | ~204 KB     | **77 KB**     |
| `#themes-data` inline blob | 821,788 B   | **1,069 B**   |

The tail moves to a static `themes-data.json` endpoint (`src/pages/themes-data.json.ts`, prerendered by Astro), fetched by the controller. The projection is shared between the inline bootstrap and the endpoint via `src/lib/theme-data.ts`, so the two cannot disagree about shape.

**The fetch starts at init, not on first interaction** as the issue proposed. The busiest entry path is a shared `?theme=<slug>` permalink, which needs a theme that is not inlined _before the user does anything_ — deferring to first interaction would leave that load waiting on a click that never comes. Starting at init puts the request in flight while the document is still parsing, and the document is now ~680 KB smaller, so parsing finishes sooner too.

Slug **validity** and theme-data **availability** are now separate questions. All 633 options are still server-rendered with their `slug`/`name`/`tags`/`apca` attributes, so search, filtering, sorting and prev/next/random work with no JSON at all; validation reads those options rather than the loaded data. Validating against loaded data — as the code did before the split — would have silently ignored every click and turned every permalink into the default until the fetch landed.

A failed fetch is non-fatal: the default theme stays rendered and the picker keeps filtering. Nine new tests cover the deferred path, verified against four mutations (validating slugs against loaded data in either place, removing the eager fetch, dropping the once-only memo) — each caught.

### Added — showcase controller extracted and tested (#178)

`ShowcaseController.astro` held ~630 lines of behaviour inside a single `<script>` tag — the largest untested unit in the repo, and unreachable from any test. Nothing about it needed to live in the component.

- **`site/src/lib/showcase-controller.ts`** — the whole body, as `initShowcaseController(doc, win)`. `doc`/`win` are injected rather than read off the globals so a test can drive a fixture document and a controlled URL. The component's `<script>` is now 7 lines of production wiring.
- **`site/test/showcase-controller.test.ts`** (53 tests) — URL↔theme round-trip, search, tag filters, sort, prev/next/random, listbox keyboard navigation, focus restoration, WCAG 2.1.4 single-key shortcut gating, export/clipboard, screen-reader announcements, `popstate`, and degraded-DOM tolerance. Verified against seven mutations of the controller, each caught.
- **`site/test/showcase-selectors.test.ts`** (76 assertions) — anti-drift guard. The controller tests drive a hand-written fixture, so every selector the controller queries is asserted against both the fixture and the real built `dist/index.html`. Runs as its own CI step after the site build, like `a11y.test.ts`.

**Two bugs the new tests found**, both fixed here:

- `?q=` and `?tags=` arriving from a shared permalink did not filter the list until the user opened the picker — `applyFilters()` only ran on open, input, chip click and `popstate`, never at init. Everything downstream reads visibility off the DOM, so prev/next/random stepped through the whole corpus and the count claimed every theme matched.
- ArrowUp on the first listbox row cleared `aria-activedescendant` instead of clamping, because `setActiveOption` treats a negative index as "no active option" — the opposite of what the adjacent "clamp rather than wrap" comment promised.

`initShowcaseController` now returns a disposer that removes every listener it registered. The page never needs it (one controller per load), but the `document`/`window` listeners outlive `document.body.innerHTML = ...`, so without a way to detach them a second init leaves the first live and both respond to `popstate` — a re-entrancy bug independent of testing.

### Fixed — the terminal mock no longer claims to be this repo's test run

- **`ShowcaseTerminal` displayed real filenames and real-looking counts** (#179) — `test/convert.test.ts (24 tests)`, `test/theme-filter.test.ts (17 tests)`, `test/formatters.test.ts (8 tests)` — so a decorative preview read as this project's actual test output, and drifted every time a test was added. It was already wrong: 17 and 8 against real values of 25 and 13, and `convert.test.ts` is now 58.
- Fixed by **removing the claim rather than syncing the numbers**. The filenames and the diff are now generic (`parser`, `palette`, `render`, `layout`), so nothing about the mock can go stale. Nobody reads a theme-preview mock for test statistics.
- Same drift class as #122, but the answer differs: theme counts are load-bearing and get a `sync-theme-count` guard; decorative sample output should simply not assert anything.
- The intentionally-failing line stays — it is what exercises the red foreground the preview exists to show.

### Fixed — four small site defects

All from #219.

- **Media-query inversion.** `ThemeSelector`'s `@media (max-width: 40rem)` block sat _above_ the base `.icon-btn .label { display: none }` rule it overrides, and won only because its selector (`.row.primary-row .icon-btn .label`) is more specific. Simplifying that selector — which looks like harmless tidying — would have silently hidden the mobile Export/Random labels. Moved below the desktop block so the **cascade**, not specificity, keeps it correct.
- **Single-character shortcuts had no opt-out** (WCAG 2.1.4). `typingIntoEditable` covered inputs, but with focus on any button — a palette chip, a tag filter — pressing `r` still fired a random theme change. `/` and `r` now require focus to be on the page body, satisfying the standard's "active only on focus" exception without adding a settings UI. Arrow keys are exempt (not character keys) and are unchanged.
- **`prefers-reduced-motion` covered one animation of nine.** `ShowcaseTerminal` guarded its cursor blink; the built CSS had 7 `transition:` and 2 `animation:` declarations otherwise unguarded. Added a global block. Durations go to near-zero rather than `none`, so `transitionend`/`animationend` still fire and nothing waiting on them hangs; `scroll-behavior` is included because the listbox scrolls the active option into view on every arrow keypress.
- **Permalinks leaked filter state.** `formatPermalink` was passed `window.location.href`, so a shared link carried whatever `?q=`/`?tags=`/`?sort=` the sender happened to have and silently opened a filtered view the recipient never chose. Now built from `origin + pathname`, carrying only `theme`.

### Fixed — no more flash of the wrong theme in the showcase

- **The showcase painted CSS fallbacks and a bare em-dash before JS ran** (#217). The site _chrome_ was already covered by ThemeToggle's pre-paint inline script, but the preview was not: it rendered `var(--tt-background, oklch(0.2 0.02 260))` with `—` as the theme name, then snapped to the real theme once ~682 KB of inlined JSON had been parsed and `applyTheme` ran. That parse cost is what made the flash visible rather than imperceptible.
- The default theme's 20 custom properties, name and meta line are now **server-rendered into the markup**, so a visit with no `?theme=` is correct on first paint with no client work at all. A visit naming a different theme still repaints once, which is unavoidable without per-request SSR.
- The default is resolved with the same `dracula`-then-first fallback order `ShowcaseController` uses, so the two cannot disagree about what "default" means.

Verified that the served HTML carries all 20 properties and the real theme name (not `—`) before any script runs, and that JavaScript then changes **nothing** for the default theme — a repaint that merely re-applies the same values would still be a flash.

### Changed — the site inlines 140 KB less JSON

- **The `#themes-data` blob was 821 KB, 47.6% of `index.html`** (#211) — HTML-parsed and then `JSON.parse`d on the main thread before anything is interactive. It is now **682 KB (43.0%)**, and the document drops from 1,726,088 to 1,586,255 bytes.
- Two fields carried most of the waste. **`accent` is never read by the client at all** — the controller uses `name`, `slug`, `isDark`, `colors`, `contrast.fgOnBg` and `dataviz`. And **`contrast` carried 7 fields** where `SlimThemeLike` (the shape the export formatters declare) has 3, and the UI reads only `fgOnBg`.
- Contrast floats are **deliberately not rounded**. That would save a further 16 KB while making the copied JSON disagree numerically with the published `themes-slim.json` — a bad trade for a "copy raw JSON" feature.
- The export menu's "Raw JSON" label now reads _preview subset of themes-slim_ rather than _themes-slim shape_, since that is now what it copies.
- The remaining 682 KB is inherent to inlining all 633 themes; serving the tail on first interaction is the real fix and a larger change.

### Fixed — theme changes are announced to screen readers

- **Changing the theme was completely silent to assistive tech** (#210). It rewrites the heading, the meta line, the WCAG badge and 20 palette values, and announced none of it — a screen-reader user pressing ←/→ to browse got no feedback at all. On an accessibility-focused project that is the worst place for the gap to be.
- Added a visually-hidden `role="status"` region (implicitly `aria-live="polite"`, so it waits for a pause rather than interrupting) that `applyTheme` writes a terse summary into: `"Duotone Dark, dark, contrast 7.6:1 AAA"`.
- **Skipped on first paint**, so it does not talk over a user who has not asked for anything yet.
- The announced contrast reuses the same rounded-down string the visible badge shows, so the two can never disagree — verified in a browser that the announcement contains the badge's exact level and ratio.
- The region is hidden with `clip-path`, never `display: none` or `visibility: hidden`; either would remove it from the accessibility tree and silence the announcements it exists to make.

### Fixed — prev/next/random and keyboard navigation now respect the sort

- **Navigation ignored `?sort=apca`** (#214). `applySort` reorders the actual `<li>` DOM nodes, but `visibleSlugs()` read `listItems` — an array captured once at load and never re-sorted — so ←/→ and random stepped through themes in build order (popular-then-name) while the list visibly showed APCA order. A code comment claimed the opposite, which is presumably how it survived.
- The same stale array backed the listbox's keyboard cursor, so ArrowUp/ArrowDown/Home/End had the bug too. Both now go through one `visibleItems()` helper that queries the DOM.
- Every other use of `listItems` (filtering, counting, clearing the active class) is order-independent and still uses the cheaper captured array.

Verified in a real browser against `?sort=apca`, where the rendered order (`atlas-ragnarok, builtin-tango-dark, dark-pastel`) genuinely differs from the server-rendered build order (`atom-one-dark, atom-one-light, ayu`): `→` now advances to the sorted next, and the keyboard cursor steps through consecutive sorted indices with `Home` landing on the first sorted row.

### Fixed — the theme picker is now operable without a mouse (site)

- **Keyboard users could not select a theme at all** (closes #206). Options carried no `tabindex` and no `id`, and the controller bound `click` only. Opening the listbox focused the search field, but the global keydown handler early-returns on any `INPUT` target except `Escape` — so a keyboard user could filter the list and then had no way to commit a selection. Implemented the ARIA APG editable-combobox pattern: focus stays in the search field (so typing keeps filtering) while `aria-activedescendant` carries a virtual cursor, moved with ArrowUp/ArrowDown/Home/End and committed with Enter. The active row scrolls into view and is styled deliberately stronger than the selected/hover treatment — real focus is elsewhere, so that outline is the only thing telling a keyboard user where Enter will land, and sharing the selected style would make it invisible exactly where it starts.
- **Focus was dropped on the floor when the listbox closed** (closes #211). `closeListbox` hid the panel without restoring focus, so focus fell back to `<body>` from inside the now-hidden subtree — the user's tab position was lost after every selection and every Escape. Now returns focus to the combobox trigger.
- **Combobox ARIA was internally inconsistent** (closes #214). `aria-haspopup="listbox"` disagreed with the popup's `role="dialog"` (it is genuinely a dialog — it holds a search field, tag filters, a sort control and the listbox), there was no `aria-controls` linking trigger to popup, and the visually-hidden "Active theme" text was a `<label for>` pointing at a `<button>` — not a labelable element, so it was announced to nobody. Now `aria-haspopup="dialog"` + `aria-controls`, with the accessible name on `aria-label`.
- **Multi-word search returned zero results** (closes #212). `applyFilters` derived a theme's name as `data-search.split(' ')[0]` — the first word only — then ANDed that truncated match against a separate full-blob check. The two disagreed, so any query containing a space matched the blob but failed `matches()`: `solarized dark` and `higher contrast` were both unreachable. Collapsed to one path, fed the real name via a new `data-name` attribute. Included here rather than separately because it breaks the same keyboard flow — press `/`, type, arrow, Enter.
- Verified end-to-end in a real browser against the built site (jsdom cannot execute Astro's ESM module scripts, and `site/test/a11y.test.ts` strips `<script>` tags before running axe): `/` opens with the cursor seeded on the current theme, arrows move it, Home/End jump to the ends, `solarized dark` matches 3 themes, Enter commits and closes, and focus lands back on the trigger after both Enter and Escape.

### Fixed — displayed contrast ratios no longer overstate conformance

- **`formatRatio` now rounds down** (#201). `toFixed(1)` rounds half-up, which let a value display as clearing a threshold it actually fails: `mirage`'s 6.9952 rendered as **"7.0:1" directly beside an AA (not AAA) badge**. 15 published values across 14 themes did this on one of `fgOnBg` / `cursorOnBg` / `selectionContrast` — e.g. `claude`/`claude-light` cursor 2.9634 → "3.0:1", `ocean`/`gleam-classic` selection ~4.47 → "4.5:1". Flooring is the standard treatment for a conformance figure: a displayed ratio must never claim more than the value supports.
- This was **display-only** — the dataset stores raw unrounded floats and every tag comparison uses them, so no stored data or tag was ever wrong. But a ratio contradicting the badge beside it is exactly what makes a reader distrust the rest of the numbers.
- **README**: the APCA-vs-WCAG example quoted `github-dark` at "6.10:1"; the actual ratio is 6.0952, so it now reads 6.09:1. The historical 0.6.0 CHANGELOG entry is left as published.

### Fixed — categorical dataviz palettes no longer ship duplicate or achromatic colors

- **28 themes shipped duplicate colors in `dataviz.categorical`** (closes #198). The second-pass fallback excluded already-selected candidates by `key` only, so a slot whose hex was byte-identical to one already chosen got re-added. `retro` published the same green six times; `aura` published three identical purples in a six-color set. A consumer charting six series got six identical bars with nothing signalling anything was wrong.
- A second, subtler path produced the same defect: **`dedupeByHue` could _introduce_ a duplicate.** When a candidate displaces another on chroma, it was only compared against the entry it displaced, not against everything else already kept. `tearout`'s `brightPurple` displaced `cyan` while carrying the same hex as the `purple` two slots away. Now collapsed by hex after the hue pass, first occurrence winning.
- **73 near-achromatic colors were selected into categorical palettes across 51 themes** (closes #202). Selection ranks candidates by `circularHueDistance`, which ignores chroma entirely — but at c ≈ 0 hue is a numerical artifact, not a property (`#a0a0a0` parses to `oklch(0.706 0 0)`). `atlas-ragnarok.categorical[3]` was a grey; `batman` contributed four. New `CATEGORICAL_MIN_CHROMA = 0.02` floor. Down to 11 entries across 2 themes, both genuinely monochrome themes where grey is the honest answer.
- **New optional `dataviz.categoricalSynthesized`.** 33 themes cannot supply 6 distinct chromatic colors from their own slots — `hercules-graphics` has none at all, `black-metal-marduk` and `owl` have one. Rather than padding with duplicates, the shortfall is now filled with colors derived from the theme's accent (farthest-point around the hue circle, lightness-separated, gamut-clamped per step), and the count of trailing derived entries is disclosed. Same disclose-the-derivation convention as the `# base09/base0F synthesized` comment in the emitted scheme YAML. Absent (not `0`) when nothing was synthesized, so the field is additive and backward-compatible. 97 derived entries across 33 themes.
- **`findDatavizErrors` now rejects duplicates.** Length was previously the only categorical check, which is how 28 themes passed validation while shipping repeated colors.
- **Test fixture fix**: `test/dataviz.test.ts`'s `cv()` helper built a synthetic hex by concatenating decimal digits and truncating to 7 characters, so `(0.5, 0.1, 25)` and `(0.5, 0.1, 250)` both serialized to `#501025`. That collision masked duplicate-detection behaviour. Now injective — one byte per component.
- `computeCategorical` returns `{ colors, synthesized }` instead of a bare array (internal API; `src/dataviz.ts` is build tooling and is not re-exported from the package entrypoint). Provenance is threaded rather than re-derived by comparing hexes, because a derived color can legitimately coincide with a slot's hex — `hercules-graphics` has an achromatic accent, so its derived greys collide with its own greys, and inferring provenance from value under-reported it.

### Fixed — CVD simulation now runs in linear-light RGB (breaking data change)

- **`cvd` scores changed for every theme** (closes #197). `culori`'s `filterDeficiency*` converts its input to gamma-encoded `rgb` and multiplies the Machado 3x3 into those non-linear values (`culori/src/deficiency.js`, `mode: 'rgb'`), but Machado, Oliveira & Fernandes 2009 define those matrices on **linear** RGB. This is a known, real error — R's `colorspace` shipped exactly it until 2.1-0 (2023), fixed there with a `linear = TRUE` argument. `src/cvd.ts` now converts to `lrgb` before handing components to culori's filter and gamma-encodes the result back, which reuses culori's own precomputed matrices (still no hand-rolled Brettel/Viénot, per #149's blocking condition) while doing the multiply in the space the model is defined on.
- **`cvd-safe` went from 39 themes to 24**, with 20 themes flipping (18 safe → caution, 2 caution → safe). The `mirage` red/green worked example moved from ΔE 0.060 to 1.700 — a 28x difference, same conclusion. **`cvd` scores from before this change are not comparable with scores after it.**
- **`CVD_SAFE_THRESHOLD` stays at 10.** It is anchored to prior art, not to a target pass rate; lowering it to preserve the old count would be fitting the ruler to the result.
- **`wong-colorblind-safe-light`'s `cyan` changed from `#2e8ec0` to `#0693a7`.** The corrected simulation dropped that theme to d=10.16/p=9.70 — below its own calibration bar — with `blue`/`cyan` limiting on all three axes. Its `cyan` had been sitting at OKLCH hue ~236°, inside `blue`'s (~244°) hue family; the #149-era fix separated them by lightness alone, which the gamma-space bug made look sufficient. Re-derived as a true cyan/teal at hue ~211.7 (`l` ≈ 0.609, `c` ≈ 0.105), holding WCAG contrast against `#fafafa` at ~3.5:1. The theme is back to `cvd-safe` at d=12.43/p=12.13, and `blue`/`cyan` is no longer the limiting pair on any axis.
- **Citation corrected**: the third author of the Machado 2009 paper is **Fernandes** (Leandro A. F. Fernandes), not "Fluck" — in `src/cvd.ts` and `README.md` (closes #201). The historical 0.6.0 entry below is left as-published.
- **README**: the claim that both `wong-*` themes "clear it comfortably on every axis" was an overclaim and is now stated precisely — they clear the two _gating_ axes; `wong-light`'s tritanopia is 9.7, just under, and tritanopia does not gate the tag.
- **Tests**: the `mirage` assertion no longer pins a model-dependent constant; it asserts the order-of-magnitude collapse that is the actual property. Added a regression test that fails if the linear conversion is ever dropped.

### Security — escape the theme name in the site's export formatters

`site/src/lib/formatters.ts` interpolated `theme.name` straight into the CSS comment header of both `formatCssVars` and `formatTailwindTheme`, so a name containing a comment terminator would close the comment early and everything after it would parse as CSS. These are the sinks a user actually reaches, by clicking "copy CSS" or "copy Tailwind".

**Found by @devmaster1987 in #235.** The equivalent build-time sink in `src/css-export.ts` was escaped in #247, which missed these two.

Escaped rather than replaced with the slug: #235 proposed substituting `theme.slug`, which closes the hole but drops the human-readable name from every generated header. Escaping keeps the name and matches what #247 does elsewhere.

`ThemeNameSchema` (#232) already excludes `*` from the permitted charset, so once that lands nothing reaching here can carry the sequence. This is the second layer — the sink stays safe even if the schema is later relaxed, which is the ordering #189 asks for.

The helper is duplicated in the site rather than imported from the package, for the same reason as `kebab`: this module is pulled into the client bundle, and importing the package entrypoint drags `culori`, `apca-w3` and `zod` in with it.

### Security — the publish job no longer runs untrusted code

- **`release.yml` is split into `build` and `publish`** (#191). It was one job, which meant `pnpm install --frozen-lockfile` — and every dependency lifecycle script it runs — executed while the job held `id-token: write`. A compromised transitive dependency's `postinstall` could read `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN` from the environment, mint the npm OIDC token, and publish an arbitrary tarball under this package name **with valid provenance**. Provenance attests that this workflow ran; it does not attest that the tarball was not tampered with inside the job, so a consumer verifying it would see a green check.
- The split is by credential, not convenience: `build` runs the install, tests and dataset build and holds **no** publish credential; `publish` holds `id-token: write`, **installs nothing**, and runs only `npm publish` against artifacts it downloads.
- **`npm` is pinned to an exact version** (`12.0.2`) instead of `@latest`. That upgrade runs immediately before publish in the job holding the OIDC token, so a compromised `latest` would be the shortest possible path to a malicious release.
- **`--ignore-scripts` on publish.** The only lifecycle hook is `prepare: husky || true`, irrelevant when publishing, and running any script in that job would reintroduce exactly what the split removes.
- Verified the publish job needs no `node_modules`: `npm publish --dry-run` from a directory containing only the checkout's files plus the downloaded `dist/` and `data/` produces the same 2,627-file, 1.6 MB tarball.

### Security — Dependabot cooldown and a human gate on production dependencies

- **7-day cooldown on both ecosystems** (#192). The threat is a compromised maintainer account shipping a malicious release: CI cannot detect a hostile `postinstall` and `pnpm audit` cannot see a zero-day, so a bad version would sail through auto-merge on green checks. Malicious releases are typically yanked within days, so a week of latency defeats most of that timeline for a week of staleness. Majors wait 30 days — they need human review regardless.
- **Auto-merge is now restricted to development dependencies.** Production dependencies are what ship to consumers, and green CI is not evidence a release is safe. They now require a human merge, as majors already did.
- **The dependency groups are split by type.** The previous single group was named `production-dependencies` while its `patterns: ['*']` matched everything, production and development alike — so no per-type gate was expressible. There are now separate `production-dependencies` and `development-dependencies` groups.
- The gate **fails closed**: any `dependency-type` / `update-type` value other than the expected ones leaves the PR for a human, and a new step logs both values and why auto-merge was withheld. `fetch-metadata`'s behaviour for a group spanning dependency types is undocumented and it does not print its outputs, so this could not be verified from CI logs — splitting the groups removes the need to rely on it, and the fail-closed direction means the residual uncertainty costs review time, never safety.

### Security — the audit gate is real, and checkouts no longer persist credentials

- **`pnpm audit` now gates CI** (#195). It carried `continue-on-error: true` while sitting in `ci-success`'s `needs`, and the gate script never checked its result — so a high-severity advisory in a direct dependency produced a green run, and combined with Dependabot auto-merge, a green _merge_.
- Gating is only honest because the advisories it was hiding are now **fixed**, not ignored: `pnpm audit --audit-level=high` exited 1 with four high-severity findings (`undici`, `fast-uri`, `brace-expansion`, `nanoid`). All four had patched versions available, so the `pnpm.overrides` pins were bumped or added — `undici@<7.29.0`, `fast-uri@<3.1.5`, `brace-expansion@<5.0.9`, `nanoid@<3.3.17`. `pnpm audit` now reports **zero vulnerabilities at any severity**.
- If a future advisory has no fix, the documented response is an explicit, commented `--ignore` rather than restoring `continue-on-error`: an ignore names what was accepted, `continue-on-error` hides everything.
- **`persist-credentials: false` on all 15 checkout steps** across every workflow. It mattered most where a write-scoped token coexists with dependency code execution — `release.yml` (`contents: write`, then `pnpm install`) and `update.yml` — since a malicious `postinstall` can read the token straight out of `.git/config`. Verified nothing depends on the persisted credential: no workflow runs `git push`/`commit`/`tag`, and `create-pull-request` authenticates with its own `token` input.
- **`update.yml` permissions scoped to the job.** `contents: write` + `pull-requests: write` were declared workflow-wide, so they would apply to any job added later. The workflow now defaults to `read-all`.

### Security — validate pinned SHAs and constrain `themesPath`

- **`.upstream-shas.json` is now schema-validated on load** (#193). It was read with a bare `as Record<string, string>` cast — unlike `sources.json`, which has always gone through `SourcesConfigSchema` — so every value flowed straight into a `git` argument slot. `execFileSync` prevents _shell_ injection but not _argument_ injection: git subcommands accept options after positional arguments, so an entry such as `--upload-pack=<command>` would execute that command, inside `release.yml`'s `id-token: write` job and `pages.yml`'s build job. New exported `PinnedShasSchema` permits only a 7-40 character hex SHA or the literal `local`.
- `git fetch` now takes `--` before the ref so it cannot be read as a flag even if that check were bypassed. **`git checkout` deliberately does not** — there the separator marks what follows as a _pathspec_, and `git checkout -- <sha>` fails outright. Both forms were verified directly rather than assumed.
- The `git()` helper's doc comment claimed `execFileSync` "eliminat[ed] shell command injection" full stop; it now distinguishes shell from argument injection, since the original wording is what made the missing validation look safe.
- **`themesPath` is constrained to plain relative segments** (#196). It reaches `git sparse-checkout set` and is joined into a filesystem read path; for a `local: true` source that join is rooted at this repo, so `../../../etc` would read outside it. Exploiting it requires a merged PR to `sources.json`, so this guards against accident and rubber-stamp review rather than a determined attacker.
- **New `test/sources.test.ts`** — 26 cases covering both schemas, including the `--upload-pack` payload, every traversal form, and assertions that the repo's own `sources.json` and `.upstream-shas.json` still validate.

### Security — the remaining two injection sinks

Companions to the `theme.name` charset constraint: that guard stops a hostile name entering, these stop it doing damage if one ever does. Escaping belongs where a value is interpolated, not only where it entered.

- **CSS comment injection** (#190). `themeToCssFile` interpolated the theme name raw into the header comment. CSS comments have no escape mechanism, so a name containing a comment terminator would close the header and turn the remainder into live rules in `data/css/<slug>.css` — a file this package ships to npm and advertises as `<link>`-able with zero JS. New exported `escapeCssComment` neutralizes the terminator; ordinary names pass through untouched.
- **YAML corruption** (#194). `yamlString` escaped only backslash and double-quote. A theme name containing a newline emitted a raw newline _inside_ the double-quoted scalar, putting the continuation at column 0 — invalid YAML for a block-mapping value, which made `data/schemes/**/<slug>.yaml` unparseable for the whole tinty/base16 consumer ecosystem. Now escapes newline, carriage return, tab, and the C0/DEL/C1 control ranges.
- **`validate.ts` now parses the emitted YAML back** with a real parser (new `yaml` devDependency) and asserts the `name` round-trips exactly. This is the more valuable half: the hand-rolled serializer was never read back, so a serialization bug could only be found by a downstream consumer hitting an unparseable file. Checking the round-tripped value, not just that it parses, is what catches an escaping bug rather than merely a syntax error.

Both fixes are defense in depth and change **no output** for the current corpus — the 633 emitted CSS files and 1,266 scheme YAML files are byte-identical after the change.

### Security — theme names are now charset-constrained at the schema boundary

- **Constrained `theme.name`** via a new exported `ThemeNameSchema`, applied to `TerminalColorThemeSchema`, `UpstreamSchemeSchema`, and `NativeSchemeSchema`. Theme names originate in third-party upstream repos that accept community submissions, and were previously an unconstrained `z.string()` that flowed unescaped into three sinks with different escaping rules: HTML (`site/src/pages/index.astro` inlines the slim dataset via `set:html`), a CSS comment (`src/css-export.ts`), and a double-quoted YAML scalar (`src/schemes.ts`). The constraint excludes exactly the characters that carry meaning in those sinks — `<` `>` `*` `\` `"` and C0/C1 control characters — while permitting Unicode letters, numbers, combining marks, and the punctuation the corpus actually uses. Audited against all 633 current theme names: **zero rejections** (the corpus uses only `( ) - _ + .` beyond alphanumerics and space; longest name is 30 characters against a 120 cap). `pnpm validate` now rejects a hostile name at build time, before it can reach any sink.
- **Fixed stored XSS** in `site/src/pages/index.astro`. `set:html` bypasses Astro's escaping and `JSON.stringify` does not escape `<`, so a theme name containing `</script>` would break out of the inlined `#themes-data` block and execute on the published site — an origin shared with every other GitHub Pages project on that account. Now escapes `<` to `<`, which is lossless (it parses back to `<`). Kept as a second layer independent of the schema constraint, because this is the sink and it should hold regardless of upstream validation.
- **Tests**: new `test/schema.test.ts` covers the accepted charset (including non-Latin scripts and combining marks — the constraint is about sink-dangerous characters, not script), each sink's break-out payload, control characters, length bounds, and a guard asserting every name in the real corpus still passes.

### Added — packed-tarball consumer test

- **New `pnpm verify:package` + a gating CI job** (#182, the last thing #169 asked for). Every other check in this repo runs against the working tree, where pnpm has hoisted every devDependency — which is exactly why `0.7.0` shipped unimportable while lint, typecheck, build and 238 tests were all green. This packs the real tarball, installs it into a scratch consumer with `--omit=dev`, and asserts: the entrypoint imports, every `exports` subpath resolves, a single named import tree-shakes (no `colorparsley`/`calcAPCA`/`sRGBtoY`, bundle under 50 KB — currently 341 B), and the tarball stays within a size/file-count budget.
- Verified non-vacuous by running it against the pre-fix `package.json`: it reports 2 clean failures — the entrypoint import and an esbuild resolution error naming `zod` — rather than passing or crashing.

### Fixed — published package was unimportable; tree-shaking restored

- **`zod` moved from `devDependencies` to `dependencies`.** `dist/schema.js` and `dist/sources.js` both `import { z } from 'zod'` at module top level, so every consumer installing `0.7.0` without dev dependencies hit `ERR_MODULE_NOT_FOUND: Cannot find package 'zod'` on the first import of the package entrypoint. Local checks never caught it because pnpm hoists the devDependency in this workspace and CI never installed the packed tarball standalone. Verified fixed by packing the tarball, installing it into a scratch consumer with `--omit=dev`, and importing the entrypoint: all 23 exports resolve.
- **Added `"sideEffects": false`.** Every module in `dist/` is pure (verified: no bare top-level statements, no global mutation), but without the flag bundlers must assume the module-level `z.object(...)` calls in `dist/schema.js` are side effects, so nothing downstream is droppable. Measured with esbuild bundling `import { COLOR_KEYS }` and nothing else: **379,302 B → 341 B**, and `colorparsley` (AGPL-3.0, a transitive dependency of `apca-w3`) goes from 4 references in the consumer bundle to **0**. This resolves the licensing concern in #169 without changing the dependency list.
- **Corrected a false comment** at `src/index.ts:23`. It claimed `src/cvd.ts` and `src/apca.ts` were "build/validate/test tooling, not part of the public package API." They are reachable from the published entrypoint — `classifyTheme` imports both via `src/classify.ts` — which is why `culori` and `apca-w3` are genuine runtime dependencies and, contrary to #169's premise, cannot move to `devDependencies`.

## [0.7.0] - 2026-07-23

### Added — base16/base24 scheme YAML + static per-theme CSS export

Adds two per-theme static export artifacts (closes #146, closes #147):

- **base16/base24 scheme YAML** (issue #146, gated on a dedup/overlap analysis against `tinted-theming/schemes` — see the issue's binding comment). New `src/schemes.ts` computes each theme's 24-slot [base24](https://github.com/tinted-theming/base24) palette (`data/schemes/base24/<slug>.yaml`) plus a 16-slot [base16](https://github.com/tinted-theming/home) subset projection (`data/schemes/base16/<slug>.yaml`). Slot mapping: `base00`/`02`/`03`/`05`/`07`/`08`/`0A`-`0E`/`12`-`17` are direct references to existing `Colors` fields; `base01`/`04`/`06` are OKLCH lightness-interpolated midpoints between their documented neighbor anchors; `base10`/`11` extrapolate further from `background`; **`base09` (orange) and `base0F` (brown) have zero source data** and are synthesized via hue-derivation — every emitted YAML discloses this with an inline `# base09/base0F synthesized` comment, per the analysis's disclosure requirement. Safe YAML emission only: `serializeScheme` emits double-quoted plain scalars exclusively, so no anchor/tag/alias can appear regardless of theme-name content. **Local export only** — the dedup analysis found 227/633 (35.9%) of this corpus already exists in `tinted-theming/schemes` as hand-curated schemes (all 7 gruvbox slugs collide) and 93.4% of the corpus is itself bulk-imported, so this project has no curation standing to bulk-submit upstream; see README's "base16/base24 scheme YAML" section for the full notice.
- **Static per-theme CSS** (issue #147). New `src/css-export.ts`'s `themeToCssFile` wraps the existing public `themeToCssVars` in both a bare `:root { ... }` block and a `[data-terminal-theme="<slug>"] { ... }` scoped block, written to `data/css/<slug>.css`. Shipped in the npm tarball (`data/` is already in `files`) and therefore reachable via jsDelivr's npm-tarball auto-serving (`https://cdn.jsdelivr.net/npm/@williamzujkowski/oklch-terminal-themes/data/css/<slug>.css`) — a static site can consume a theme with one `<link>` tag and zero JS.
- **Wiring**: both exports run as a new post-data build step (`scripts/write-exports.ts`'s `writeExportArtifacts`, called from `scripts/build.ts`'s `main`) — pure functions of each theme's own `colors`/`name`/`isDark`, so a no-op rebuild produces byte-identical output here too (verified via a double-build diff, same property the `updatedAt`-preservation fix (#141) maintains for `data/by-name/*.json`).
- **Tests**: new `test/schemes.test.ts` (slot-mapping correctness incl. reference/interpolated/synthesized/extrapolated derivation properties, gamut/round-trip validity, safe-YAML-emission properties, disclosure-comment presence, determinism, a real-data sanity check against `dracula`) and `test/css-export.test.ts` (both CSS blocks carry identical declarations, every `ColorKey` present, determinism).
- **Data**: `data/schemes/base16/`, `data/schemes/base24/`, `data/css/` (633 files each) committed alongside the rest of `data/` — same "generated but committed" convention, and required for the npm tarball to actually ship them.

## [0.6.0] - 2026-07-23

### Added — colorblind-safety (`cvd`) + APCA (`apca`) metrics

Adds two additive per-theme metric blocks (closes #149, closes #151):

- **`cvd`** (issue #149) — colorblind-safety simulation scores. `src/cvd.ts` simulates deuteranopia/protanopia/tritanopia over the theme's 6 classic ANSI hues (`red`/`green`/`yellow`/`blue`/`purple`/`cyan`) via `culori`'s `filterDeficiencyDeuter`/`filterDeficiencyProt`/`filterDeficiencyTrit` (Machado, Oliveira & Fluck 2009) — **no hand-rolled Brettel/Viénot matrices**; culori's installed 4.0.x already ships these filters, so no dependency upgrade was needed. Score is the minimum pairwise CIEDE2000 ΔE among the 6 simulated colors, the same ΔE metric family this package already uses for round-trip validation. New tags `cvd-safe` / `cvd-caution`: safe requires **both** `deuteranopia` and `protanopia` >= `10` (CIEDE2000 units) — `tritanopia` is reported but data-only, doesn't gate the tag.
- **`apca`** (issue #151) — APCA Lc scores, **data only** (no tag gates on these values; `wcag-*` tags are unchanged). `src/apca.ts` computes `fgOnBg`/`minAnsi`/`minAnsiSlot` via the `apca-w3` reference implementation (`calcAPCA`) — new production dependency, verified against `apca-w3`'s own published test vectors, never hand-rolled. Mirrors `contrast.fgOnBg`/`minAnsi`/`minAnsiSlot`'s shape; APCA's Lc is signed/polarity-aware (positive = dark text on light bg, negative = light text on dark bg), unlike WCAG2's symmetric ratio.
- **Schema**: new optional `CvdSchema` / `ApcaSchema` in `src/schema.ts`, wired into `TerminalColorThemeSchema` as `cvd?:` / `apca?:` — additive, backward-compatible.
- **Shared refactor**: `ANSI_KEYS`/`DARK_BG_BLENDS`/`LIGHT_BG_BLENDS` (the "which ANSI slots count as text, which conventionally blend with bg" logic `classify.ts`'s WCAG `minAnsi` already used) moved to a new `src/ansi-slots.ts` so `apca.ts`'s APCA `minAnsi` walks the identical candidate set without either module importing the other.
- **Data fix**: validating against the Okabe-Ito-derived `wong-colorblind-safe-dark`/`wong-colorblind-safe-light` native themes (issue #149's own "must score cvd-safe" reference) surfaced a real bug — `wong-colorblind-safe-light`'s `cyan` slot (`#0080a8`) had been darkened for WCAG contrast in a way that (unlike every other slot in that theme) drifted its OKLCH lightness close enough to `blue`'s to collapse the two under deuteranopia (was 3.53, now 11.62) and protanopia (was 4.95, now 10.88). Fixed by re-deriving `cyan` (`#2e8ec0`) at the same OKLCH hue as `wong-colorblind-safe-dark`'s canonical Okabe-Ito sky-blue (~236°) with a lightness chosen to keep WCAG contrast against the theme's `#fafafa` background at ~3.5:1 while restoring the lightness gap from `blue` that CVD separation depends on.
- **New dependency**: `apca-w3` (production) + `@types/apca-w3` (dev) — same "one npm package, DefinitelyTyped types in devDependencies" pattern as `culori`/`@types/culori`.
- **Tests**: new `test/cvd.test.ts` (minimum-pairwise-ΔE helper, tag-threshold boundaries, the Okabe-Ito reference palette scoring safe, a real in-corpus near-isoluminant red/green clash in `mirage` scoring caution, real-data sanity against both `wong-*` themes) and `test/apca.test.ts` (exact matches against `apca-w3`'s own published test vectors, `minAnsi`/`minAnsiSlot` selection + blend exclusion, real-data polarity sanity checks).
- **Corpus stats** (all 633 themes rebuilt with the new fields): `cvd-safe` = 39 themes (~6% of the corpus — most themes here are decorative community palettes never designed with CVD safety in mind; the Okabe-Ito/Paul-Tol-derived themes and a handful of others clear the bar). 13 themes pass `wcag-aa` but have `|apca.fgOnBg| < 45` (e.g. `github-dark`: 6.10:1 WCAG ratio, only -43.5 Lc) — a concrete illustration of WCAG2 overstating contrast in low-luminance dark-theme ranges.
- `updatedAt` legitimately bumps for every theme in this release: every theme gains new `cvd`/`apca` fields, so (per the updatedAt-preservation fix, #141) all 633 correctly update.

## [0.5.0] - 2026-07-23

### Added — derived dataviz block (categorical + sequential + diverging)

Adds a per-theme `dataviz` block — a chart-ready palette derived purely from each theme's own `colors` + `accent`, so downstream consumers (e.g. remarque's syntax-highlighting bridge) don't have to re-derive categorical/ramp colors from a raw ANSI palette themselves (closes #150).

- **New `src/dataviz.ts`**: pure functions over the existing OKLCH-interpolation/gamut-fitting infrastructure in `convert.ts` (`convertOklchToColor`, `oklchRoundTripDeltaE`) and the tie-break-order convention established by `accent.ts`'s `ACCENT_ANSI_ORDER`:
  - `categorical` (6-8 colors) — selected from the theme's 12 chromatic ANSI slots. Near-identical hues (a `bright*` slot within ~20° of its normal counterpart) dedupe to whichever is more chromatic; selection then starts from the hue closest to the theme's `accent` and greedily adds the remaining candidate that maximizes its minimum hue-distance to everything already picked (farthest-point / max-min-distance sampling — the Carbon Design System / Observable Plot convention for adjacent-distinguishability, and the ordering Judith Helfman's categorical-color guidance recommends to avoid placing near-complementary hues next to each other). Settles at 6 for low-hue-diversity themes; extends to 7 or 8 only when that many distinct hue clusters actually exist.
  - `sequential` (7 steps) — a background -> accent OKLCH interpolation: lightness ramps from the background's own value to the accent's, chroma ramps from 0 to the accent's own chroma, hue fixed at the accent's hue. Index 0 is always background-anchored (lowest emphasis), the last index always the accent (highest emphasis) — dark-to-light for dark themes, light-to-dark for light themes, same emphasis semantic either way.
  - `diverging` (7 steps, always odd) — two arms (the accent's hue, and the `categorical` hue farthest from it) meeting at a near-achromatic midpoint (~0.0075 chroma), with lightness a single linear ramp across the whole array so the midpoint's lightness is just that ramp evaluated at its center.
  - Both `sequential` and `diverging` gamut-fit every step: chroma is clamped to what's actually displayable at that step's own lightness/hue _before_ rounding — the sRGB gamut boundary narrows sharply near black/white and shifts with hue, so a naive linear interpolation can walk through combinations that are valid at the ramp's endpoints but not partway through.
- **Schema**: new optional `DatavizSchema` (`categorical` length 6-8, `sequential` length 5-7, `diverging` odd length 7 or 9), wired into `TerminalColorThemeSchema` as `dataviz?:` — additive, backward-compatible.
- **Validation**: `findDatavizErrors` (used by `scripts/validate.ts`) checks categorical/diverging length bounds, sequential lightness-monotonicity, and a round-trip ΔE2000 < 1.0 gate on every derived (`sequential`/`diverging`) color — `categorical` is excluded from the round-trip check since its entries are references to already-validated `colors[key]` values, not new derivations.
- **Projections**: `dataviz` is present in full in `themes.json`; trimmed to `{ categorical: string[] }` (oklchCss strings only) in `themes-slim.json`, mirroring how `accent` gets trimmed there; omitted entirely from `index.json` to keep it lean.
- **Tests**: new `test/dataviz.test.ts` covers determinism, categorical length bounds (6/7/8 and the pathological-monochrome floor), hue-distance/dedupe properties, sequential/diverging monotonicity and gamut validity, `findDatavizErrors`' failure modes, and a real-data sanity check against `remarque-dark`/`remarque-light` (`categorical[0]`'s hue lands within a few degrees of their shared accent hue, 250°).
- **Corpus stats** (all 633 themes rebuilt with the new field): categorical size distribution is 6 = 516 themes, 7 = 81, 8 = 36.
- `updatedAt` legitimately bumps for every theme in this release: every theme gains a new `dataviz` field, so (per the updatedAt-preservation fix, #141) all 633 correctly update.

### Added — cursor/selection contrast + brightness-monotonicity metadata

Expands per-theme `contrast` metadata beyond `fgOnBg`/`minAnsi` (closes #145). The schema has carried `cursor` and `selection` color slots since day one but computed nothing for them, and nothing checked that a theme's `bright*` ANSI slots are actually lighter than their normal counterparts — a real bug class (microsoft/terminal #12957/#5384, terminator #943) where such themes render worse than authored in emulators that map SGR bold to the bright palette.

- **New optional `contrast` fields**, mirroring `minAnsiContrast`'s pattern in `src/classify.ts`, additive/backward-compatible (absent for data built before they existed):
  - `cursorOnBg` — WCAG ratio of cursor vs background.
  - `selectionContrast` — WCAG ratio of foreground vs selection-background (the schema has no dedicated selected-text-color slot, so fg-on-selection is the meaningful "can you read selected text" pair).
  - `brightnessOrdered` — `true` iff every `bright*` slot's OKLCH lightness exceeds its normal counterpart's, across all 8 pairs.
  - `brightnessViolations` — the `bright*` slot names that fail the above check; empty when `brightnessOrdered` is `true`.
- **New derived tags** in `src/classify.ts` (`contrastTags`), each with a justified threshold documented in code and in README's "Tags" section:
  - `cursor-visible` — `cursorOnBg >= 3.0` (WCAG 1.4.11 Non-text Contrast floor; a cursor is a UI element, not text).
  - `selection-legible` — `selectionContrast >= 4.5` (WCAG 1.4.3 AA body-text bar, since selected text is still text).
  - `brightness-ordered` — `brightnessOrdered` is `true`.
- **Schema**: `ContrastSchema` in `src/schema.ts` gains the four fields above, all `.optional()` — additive, no breaking change for existing consumers.
- **Tests**: new `describe` blocks in `test/convert.test.ts` cover cursor/selection threshold boundaries and brightness-monotonicity, including a fixture authored specifically as a known real-world-style violator (`brightBlack` darker than `black`).
- **Corpus stats** (all 633 themes rebuilt with the new fields): `cursor-visible` 580, `selection-legible` 391, `brightness-ordered` 224 — the interesting number is the 409 brightness-ordering violators (65% of the corpus), since that's a real bug class rather than a stylistic choice; those themes render worse than authored in emulators that map SGR bold to the bright palette.
- `updatedAt` legitimately bumps for every theme in this release: with the updatedAt-preservation fix (#141), only content-changed records churn — and every theme gains new `contrast` fields here, so all 633 correctly update.

## [0.4.0] - 2026-07-23

### Fixed

- **`updatedAt`/`generatedAt` churn on unchanged themes** (closes #140). `scripts/build.ts` stamped every theme, and the aggregate `index.json`'s `generatedAt`, with the build's wall-clock time unconditionally — so a no-op weekly sync (nothing changed upstream) still touched all 633 `data/by-name/*.json` files plus `themes.json`/`themes-slim.json`/`index.json`, drowning any real change in pure timestamp noise (#139 was 635 files / ±1267 lines for zero substantive change).
  - New `src/preserve.ts` (`contentEqualIgnoring`, `preserveThemeUpdatedAt`, `preserveIndexGeneratedAt`): deep-equality helper that ignores a named field (order-independent for object keys), used to compare a freshly-built record against its previous on-disk version before deciding whether to bump its timestamp.
  - `scripts/build.ts` now reads the existing `data/by-name/*.json` records (and `data/index.json`) into memory _before_ `rmSync(DATA_DIR, ...)` wipes them, then carries each theme's previous `updatedAt` forward — and the index's `generatedAt` — when the rest of the record is unchanged. `themes.json`/`themes-slim.json` need no separate handling: they're derived from the same theme objects, so they inherit the stability once per-theme `updatedAt` is preserved.
  - Verified: two consecutive `pnpm build:data` runs from a clean `main` state now produce a byte-identical `data/` tree (zero git diff, matching SHA-256 checksums across all 634 JSON files).
  - New `test/preserve.test.ts` covers the preserve/bump logic directly: content-equal-ignoring-key semantics (including nesting and object-key order), and that `updatedAt`/`generatedAt` are carried forward on no-op input but bumped when a color, tag, count, or upstream SHA actually changes.

- **Build-maintained theme counts** (closes #122). "485" had drifted 60+ themes stale across README.md (x2), `package.json` `description`, `AGENTS.md`, and the OG social-card image/rasterizer, because every one hardcoded a number nothing ever regenerated. Root-cause fix instead of a one-off number bump:
  - `site/src/layouts/BaseLayout.astro`'s default SEO description and `site/src/components/ThemeSelector.astro`'s search placeholder now compute the count from the dataset at build time (`themes.length` / the package's `index.json`) instead of hardcoding it — always correct, no sync step needed.
  - `site/scripts/rasterize-og.ts` reads the live count from `data/index.json` when rasterizing the OG PNG, instead of a string literal baked into the script.
  - README.md, AGENTS.md, and `site/public/og-image.svg` (checked-in static asset, not build-generated) wrap their counts in `<!-- theme-count -->N<!-- /theme-count -->` markers; `package.json`'s `description` is synced by a narrower regex anchored to its fixed phrasing (JSON can't hold comments).
  - New `scripts/sync-theme-count.ts` (`pnpm sync-theme-count` to write, `pnpm sync-theme-count:check` to verify) rewrites all of the above from `data/index.json`'s `count`, and additionally scans every git-tracked file for _any other_ bare `NNN themes`/`NNN schemes` hardcode so a fresh one can't quietly rot the same way. Wired into CI's `build` job right after the dataset rebuild — a stale or newly-introduced hardcoded count now fails CI instead of shipping.
  - `docs/RELEASING.md`'s versioning-policy aside ("485 themes is expected to drift") was reworded to be count-free — it was never asserting the live count, just explaining why minor bumps happen.
  - CHANGELOG's historical dated mentions of "485 themes" are intentionally left as-is — they describe past releases, not current state.

## [0.3.0] - 2026-07-23

### Added — `accent` signature-color metadata

Optional `accent` field on every theme record, `themes.json`, `themes-slim.json`, and `index.json` entry (closes #133). Computed at build time by the same cursor-if-chromatic-else-most-chromatic-ANSI heuristic remarque-tokens' theme bridge (`scripts/theme.mjs`, `accentHue()`) already used at derivation time — `cursor` when its OKLCH chroma is >= 0.05, else the most-chromatic of `blue`/`purple`/`red`/`green`/`cyan`/`yellow`, ties broken by that order. `accent` is a REFERENCE to the chosen slot's own `hex`/`oklch`/`oklchCss` (never a newly derived color); `scripts/validate.ts` (`findAccentErrors`) asserts that equality exactly, and that `accent.source` is `cursor` or one of the 16 ANSI keys. `src/accent.ts` also carries `CURATED_ACCENT_OVERRIDES` — a curated per-theme override map (seeded empty) for the rare heuristic miss, same shape as `CURATED_COUNTERPART_OVERRIDES`. Trimmed to `{ source, oklchCss }` in `themes-slim.json` / `index.json`. Corpus split: `cursor` 232, `red` 153, `purple` 92, `green` 28, `blue` 18, `yellow` 16, `cyan` 8 (of 547 themes).

### Added — OKLCH-authored native theme sources

Native theme sources (`data-sources/native/*.json`) may now author each color
slot as either hex (unchanged today-format) or OKLCH — an `oklch(L C H)` CSS
string or an `{l, c, h}` object (closes #132). For OKLCH-authored slots, `hex`
becomes the DERIVED field (gamut-clamped via culori's `clampChroma` before
conversion) while `oklch`/`oklchCss` carry the authored numbers verbatim,
never re-derived from the resulting hex. Upstream-fetched sources are
unaffected — they stay hex-only.

- **`SourceConfigSchema.nativeAuthoring`** — when `true`, `scripts/build.ts`
  routes the source through the new `src/parsers/native.ts` +
  `resolveNativeColor` path instead of the generic hex-only
  `UpstreamSchemeSchema` path. Set on the `native` source only.
- **`TerminalColorTheme.oklchAuthored`** — new optional, additive-only field
  listing which color keys were OKLCH-authored. Absent for every theme built
  before this field existed and every hex-only theme; threads provenance from
  the build into `scripts/validate.ts`.
- **`scripts/validate.ts`** ΔE2000 round-trip check inverts direction for
  OKLCH-authored slots (authored oklch → derived hex → oklch), same ΔE < 1.0
  threshold, unchanged for hex-authored slots.
- **`src/schema.ts`** — `NativeSchemeSchema` / `NativeColorInputSchema` /
  `NativeOklchCssSchema` validate native source files at the ingest boundary;
  an invalid OKLCH value (e.g. `l > 1`, a non-numeric component) fails loudly
  rather than being silently clamped.
- **`src/convert.ts`** — `convertOklchToColor`, `parseOklchCss`,
  `resolveNativeColor`, `oklchRoundTripDeltaE`.
- **`remarque-light` / `remarque-dark`** re-authored in OKLCH using the exact
  [remarque-tokens](https://github.com/williamzujkowski/remarque) design
  values for the 4 anchor slots, and the previously hex-derived OKLCH
  equivalents (verbatim, un-redesigned) for the 16 ANSI slots. Both themes
  retain their `wcag-aaa` + `ansi-legible` tags and `isDark` polarity; every
  derived hex is byte-identical to the prior hex-authored value.

| Slot                  | Theme | Before (hex→oklch, quantized) | After (authored, exact) |
| --------------------- | ----- | ----------------------------- | ----------------------- |
| `background`          | Light | `oklch(0.974 0.005 78.3)`     | `oklch(0.975 0.005 80)` |
| `foreground`          | Light | `oklch(0.18 0.009 75)`        | `oklch(0.18 0.01 80)`   |
| `cursorColor`         | Light | `oklch(0.499 0.141 250.3)`    | `oklch(0.5 0.14 250)`   |
| `selectionBackground` | Light | `oklch(0.919 0.04 250.6)`     | `oklch(0.92 0.04 250)`  |
| `background`          | Dark  | `oklch(0.161 0.01 75.1)`      | `oklch(0.16 0.01 80)`   |
| `foreground`          | Dark  | `oklch(0.901 0.006 84.6)`     | `oklch(0.9 0.005 80)`   |
| `cursorColor`         | Dark  | `oklch(0.68 0.119 250)`       | `oklch(0.68 0.12 250)`  |
| `selectionBackground` | Dark  | `oklch(0.299 0.061 251.3)`    | `oklch(0.3 0.06 250)`   |

## [0.2.0] - 2026-07-23

### Added — `counterpart` pairing metadata

Optional `counterpart` field on every theme record, `themes.json`, `themes-slim.json`, and `index.json` entry (closes #128). Points at the theme's canonical opposite-polarity variant (`remarque-light` ⇄ `remarque-dark`, `tokyonight-storm` → `tokyonight-day`). Directional by design: several dark variants may point at one canonical light while the light points back at only the canonical dark. Computed at build time by an iterative multi-suffix stem heuristic plus a curated override map for the 9 ambiguous families (catppuccin, claude, github, gruvbox, gruvbox-material, material, rose-pine, tokyonight, zenbones); validation fails the build on a dangling or same-polarity counterpart. 129 of 547 themes carry the field.

### Added — Remarque Light / Remarque Dark native themes

Two more hand-curated native themes (closes #127). Brings native count from 15 → 17 and dataset total to 547.

- **`Remarque Light`** / **`Remarque Dark`** — the [remarque-tokens](https://github.com/williamzujkowski/remarque) design system's default palette, expressed as a terminal theme: warm paper-and-ink neutrals at hue 80, a muted blue accent at hue 250. ANSI slots use house-style hues (red 25, green 145, yellow 85, blue 250, purple 310, cyan 195) with per-color lightness solved against each theme's background so every non-blend-convention slot clears ≥ 4.6:1 contrast (margin over the classifier's 3:1 `ansi-legible` floor). Bright variants are lighter (light theme) or lighter-and-more-chromatic (dark theme) than their normal counterparts, per terminal convention.
- Both themes carry `wcag-aaa` + `ansi-legible` tags: `remarque-light` is `fgOnBg` 17.45:1, `minAnsi` 4.71:1 (`brightYellow`); `remarque-dark` is `fgOnBg` 14.43:1, `minAnsi` 5.01:1 (`yellow`). `isDark` is `false` / `true` respectively, as expected from each background's OKLCH `l`.
- Filenames `remarque-light.json` / `remarque-dark.json` (slugs `remarque-light` / `remarque-dark`) intentionally share the `remarque` stem so downstream family-pairing heuristics group them.

### Added — Phase 5b: more native themes

Eight additional hand-curated themes layered on top of the Phase 5 native source. Brings native count from 7 → 15 and dataset total to 545.

- **Vintage CRT** (3 more): `DEC VT220 Amber` (more orange than the original Amber CRT), `Hercules Graphics` (white-on-black with the slight green tint of the Hercules monochrome graphics card), `Tektronix 4014` (the storage tube's distinctive yellowish-green phosphor).
- **Accessibility** (2 more): `Tol Bright Dark` (Paul Tol's bright qualitative palette — colorblind-safe per [sronpersonalpages.nl/~pault](https://sronpersonalpages.nl/~pault/)), `IBM Carbon Deuteranopia Dark` (palette derived from IBM Carbon Design System's Gray 90 / functional colors, deuteranopia-tested).
- **Design-system** (3 more): `Linear Dark` (signature `#5e6ad2` indigo accent), `Radix Slate Dark` (Radix UI Slate scale), `Tailwind Slate Light` (Tailwind v4 default palette mapped to a light-mode terminal).

All three accessibility themes clear `wcag-aaa` + `ansi-legible`. Three of four design-system themes clear `wcag-aaa` + `ansi-legible`; `Tailwind Slate Light` is `wcag-aaa` but not `ansi-legible` (some bright slots fall below 3:1 against the very pale slate-50 background — that's the Tailwind palette's actual behaviour, accurately surfaced).

### Added — native (in-repo) hand-curated themes

- **`SourceConfigSchema.local`** field — when `true`, the source's theme files live in this repo under `themesPath` (relative to repo root). Local sources skip the upstream fetch step entirely, use `"local"` as their pinned `upstreamSha`, and emit `sourceUrl` permalinks that point to `main` rather than a 40-hex SHA.
- **`upstreamSha` schema** widened from `[a-f0-9]{7,40}` to also accept the literal `"local"` for native records.
- **`scripts/fetch-upstream.ts`** writes `local` to `.upstream-shas.json` for local sources without cloning anything.
- **`scripts/build.ts`** routes file reads through `sourceRootDir(source)` so local sources resolve relative to repo root.
- **`data-sources/native/`** directory holds 7 hand-curated themes filling gaps that aren't ingestible from upstreams:
  - **Vintage CRT** (3): `Amber CRT` (P3 phosphor), `IBM 5151 MDA` (the original monochrome green monitor), `Apple II Green`.
  - **Accessibility** (2): `Wong Colorblind-Safe Dark` and `Wong Colorblind-Safe Light` — palette from Bang Wong, _Nature Methods_, 2011 (deuteranopia/protanopia-safe; both clear WCAG AAA on `fgOnBg` and `ansi-legible` on `minAnsi`).
  - **Design-system-aligned** (2): `Tailwind Slate Dark` (Tailwind v4 default palette mapped to terminal slots) and `Vercel Geist Dark` (Vercel's familiar `#0070f3` blue accent + neutral grays).
- Brings the dataset to 516 themes when this PR lands on top of Phase 1 (#77) and Phase 2-4 (#78).

### Added — format-adapter layer + ghostty / jsonc / warp-yaml sources

- **`src/parsers/`** — every source format now goes through a parser that normalises into the canonical mbadolato/Windows-Terminal-JSON shape. Four formats: `windowsterminal-json` (existing), `windowsterminal-jsonc` (strips line + block comments + trailing commas), `ghostty` (`palette = N=#hex` + top-level keys), `warp-yaml` (warpdotdev `terminal_colors.normal/bright` schema, magenta → purple).
- **`SourceConfigSchema.format`** field added (optional, defaults to `windowsterminal-json` for back-compat). `SOURCE_FORMATS` constant and `SourceFormat` type exported from `src/sources.ts`.
- **`SourceConfigSchema.fileExtension`** field added for the rare source that publishes its theme files under a non-default extension; otherwise the parser's default extension drives discovery.
- **`scripts/build.ts`** dispatches by format. `readSourceFiles` filters by extension (or "no extension" for ghostty) and uses `withFileTypes` so directory entries can't slip through.
- **`test/parsers.test.ts`** — 12 new vitest cases covering each parser's happy path + a few sharp edges (single vs. double quotes in Warp YAML, JSONC trailing commas, ghostty selection-background fallback, kanagawa-paper-style header comments).
- **Six new sources onboarded** via the new format adapters:
  - `wnkz/monoglow.nvim` (Apache-2.0, ghostty) → 4 themes (lack/light/void/z).
  - `jpwol/thorn.nvim` (MIT, ghostty) → 4 themes (Dark/Light × Cold/Warm).
  - `ThorstenRhau/token` (BSD-3-Clause, ghostty) → 2 themes (dark/light).
  - `nickkadutskyi/jb.nvim` (Apache-2.0, ghostty) → 2 themes (dark/light).
  - `thesimonho/kanagawa-paper.nvim` (MIT, jsonc) → 2 themes (canvas/ink).
  - `warpdotdev/themes/special_edition` (Apache-2.0, warp-yaml) → 8 themes (Asteroid City, Barbie, Grafbase, Lumon, Oppenheimer, Pride, Thanksgiving, Winter).
- Total: 508 → 530 themes (+22) on top of Phase 1.

### Added — Phase 1 source expansion

- **Mbadolato pin bumped** to `5e4d1de9`. Picks up ~16 new themes upstream brought in since the prior pin.
- **`scottmckendry/cyberdream.nvim`** (MIT) — adds `Cyberdream` and `Cyberdream Light` (cyberpunk-aesthetic themes published in Windows Terminal JSON form via `extras/windowsterminal/`).
- **`oskarnurm/koda.nvim`** (MIT) — adds `koda-dark` and `koda-light` (minimalist).
- **`hyperb1iss/silkcircuit`** (MIT) — adds `SilkCircuit` (single distinctive theme: electric purple cursor, magenta-shifted palette).
- Total: 487 → 508 themes (+21).

### Added — multi-source data pipeline (#74)

- **`sources.json`** — ordered list of upstream theme repos to ingest. Order is the slug-collision priority order: when two sources emit the same slug, the source listed first wins and the dropped duplicate is logged at build time. `mbadolato/iTerm2-Color-Schemes` stays first so existing slugs are byte-stable.
- **`.upstream-shas.json`** — replaces the single-source `.upstream-sha`. Records the resolved commit SHA per source, written by `scripts/fetch-upstream.ts` after a successful sparse clone of every source.
- **Per-source clones** — `upstream/<source-id>/<themesPath>/*.json`. `scripts/fetch-upstream.ts` and `scripts/build.ts` iterate every source listed in `sources.json`.
- **`source` field** widens from `'iterm2-color-schemes'` (literal) to a kebab-case string validated against the active sources config. `ThemeIndex` gains `upstreamShas: Record<string, string>`; the legacy `upstreamSha` field is preserved as an alias for the primary source's SHA so older consumers keep working.
- **Public schema exports** for `SourceConfigSchema` / `SourcesConfigSchema` and types so downstream tools can introspect sources.
- **Within-source duplicate-slug guard** preserved (still fails the build). Cross-source collisions log a warning instead.
- **Warm Burnout themes** — `Warm Burnout Dark` and `Warm Burnout Light` (MIT, [`felipefdl/warm-burnout`](https://github.com/felipefdl/warm-burnout)) appear as the first non-mbadolato entries in the dataset (487 themes total).

### Added — governance + quality

- `AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` — repo governance adapted from nexus-agents v2.2.0 standards. `SECURITY.md` documents four Scorecard checks intentionally deferred (Fuzzing, CIIBestPractices, Maintained, CodeReview) with rationale.
- Prettier, ESLint strict ruleset, markdownlint, commitlint, Husky hooks, gitleaks config, lychee link-check config.
- `.github/`: CodeQL workflow, OpenSSF Scorecard, link-check workflow, gitleaks workflow (CI-side in addition to the husky hook), Dependabot config, PR + issue templates, CODEOWNERS, FUNDING.
- `.editorconfig`, `.gitattributes` for consistent line endings and indentation across editors.
- `pnpm.overrides` in `package.json` forcing patched versions of transitive advisories (`js-yaml >= 4.1.1`, `markdown-it >= 14.1.1`, `smol-toml >= 1.6.1`).

### Added — classifier and dataset

- **WCAG 2.x contrast data** on every `TerminalColorTheme` (#58). Adds `contrast: { fgOnBg, minAnsi, minAnsiSlot }` and five new tags — `wcag-aaa`, `wcag-aa`, `wcag-aa-large`, `wcag-fail`, `ansi-legible`. Existing `high-contrast` / `low-contrast` tags retained for back-compat. `minAnsi` excludes the slot(s) that conventionally blend with the background (`black` + `brightBlack` on dark themes, `white` + `brightWhite` on light themes) so intentional near-bg slots don't false-flag otherwise well-formed themes. `SlimTheme` also carries `contrast` so the picker can read it without pulling the full dataset.
- Corpus distribution at the current pinned SHA: 410 AAA, 463 AA, 9 `wcag-fail`, 255 `ansi-legible`.

### Added — GitHub Pages theme-picker site

- `site/` — Astro 5 project deployed to https://williamzujkowski.github.io/oklch-terminal-themes/ via `.github/workflows/pages.yml`. Dogfoods the npm package via `workspace:*` — no re-parsing of upstream iTerm schemes.
- **Combobox picker + live showcase** (#46). The original grid-of-tiles was replaced with a single theme-selector combobox and a live scrolling showcase painted from the active theme's palette: full 20-swatch palette, terminal session, IDE mock with tree / tabs / code / status bar, a blog/reading view with callouts, and a dashboard with stat cards / tables / progress bars.
- **Search + tag filters** in the listbox. 8 chips: dark / light / vibrant / muted / `wcag-aaa` / `wcag-aa` / `ansi-legible` / popular. URL state round-trips (`?q=...&tags=...`).
- **WCAG badge** in the showcase header (#59). Shows the tier + fg/bg ratio (`AAA · fg 13.4:1`); green tint for AAA, red for Fail, neutral accent otherwise. Explicitly labels the ratio as `fg` so users don't assume the rating certifies ANSI-slot legibility.
- **Export menu**: copy `:root` CSS vars, Tailwind v4 `@theme` block, raw JSON, or shareable permalink (`?theme=<slug>`). Graceful "Clipboard blocked" toast when the Clipboard API is denied.
- **Palette chip copy-to-clipboard**: clicking any of the 20 palette chips copies its `oklch(...)` string, with a status toast.
- **Site-chrome light / dark toggle** (separate from the theme preview). Inline pre-paint script prevents FOUC; explicit preference persists via `localStorage`; OS changes still propagate when no explicit choice has been made.
- **Mobile responsive** (#52, #61, #62). Every element fits a 390px viewport without horizontal scroll: showcase containers capped at `min-width: 0` so deep `<pre>` descendants contain their own overflow; IDE tree hidden at ≤ 30rem; palette grid drops to 2 columns; dashboard panels stack; ThemeSelector primary row stacks the combobox above prev / next / random / export. At ≤ 30rem the IDE code and reading `<pre>` switch to `white-space: pre-wrap` and the terminal gets a tight font (content pre-trimmed so no-wrap already fit, but pre-wrap is now an unconditional guarantee).
- **Sticky control band** (#61). The ThemeSelector is `position: sticky; top: 0` with a backdrop-blurred tint and `env(safe-area-inset-top)`-aware padding, so prev / combobox / next / random / export stay on-screen while the user scrolls through the showcase.
- **Collapsed palette on mobile** (#62). The palette section is a `<details>` — open by default on desktop, closed on first paint at ≤ 30rem so the terminal mock is above the fold. User toggles persist across re-paints.
- **Keyboard shortcuts**: `/` opens the listbox, `←` / `→` cycle prev/next theme, `r` picks a random theme, `Esc` closes the listbox.
- **A11y**: `aria-pressed` tag chips + toggle; `aria-live` filter count; `role="status"` copy toast; descriptive `aria-label`s on interactive affordances; full keyboard tabbing. Lighthouse + axe wired into CI so regressions are caught at PR time.
- **Performance**: single static HTML page; the controller script is the only JS bundle. Themes-slim data is embedded as inline JSON for zero-roundtrip preview lookups.
- **Open Graph + Twitter card meta**, canonical URL, robots directive, and a 1200×630 OG image — shared links in Slack / Discord / iMessage render with title + description + preview image.
- **Unit tests** for the site library (`theme-filter.ts` + `formatters.ts`) — 30 vitest cases covering filter matching, URL parse/serialise round-trips, CSS/Tailwind/JSON formatters, permalink construction, and WCAG label/ratio formatting. Wired into CI.

### Added — release + publish automation

- **OIDC Trusted Publishing** to npm for the root package.
- **Conventional-Commit-driven GitHub Releases** via commit labels.

### Removed

- **Side-by-side compare mode** (#53). With 485 themes the primary job is discovery (search / filter / random / prev / next), not A/B comparison. Removing it collapsed the dual-slot state machine, removed `?compare=<slug>`, dropped the `c` keyboard shortcut, and simplified the controller by ~160 lines. Permalink format `?theme=<slug>` unchanged.

### Changed

- CI workflow now runs commitlint (on PRs), ESLint, Prettier format check, markdownlint, typecheck, tests, full build-and-validate pipeline, site build + typecheck + tests, Lighthouse, axe, and pnpm audit. `CI Success` gate job aggregates all required checks.
- Dark-mode `--border` fixed (#62): was `oklch(1 1 0 / 0.12)` — chroma=1 at hue=0 is extreme red, giving every border a visible red tint once composited over the dark background. Now `oklch(1 0 0 / 0.12)` (achromatic white at 12% alpha), matching the shape of the light-mode `oklch(0 0 0 / 0.12)` value.
- Upgraded dev dependencies: eslint 9 → 10, @commitlint/\* 19 → 20, lint-staged 15 → 16, markdownlint-cli2 0.15 → 0.22, vitest 2 → 4, vite 6 → 7, zod 3 → 4. Held back: `@types/node` (tracks Node 22 LTS), `typescript` (kept on 5.9.x — Astro 5 ecosystem's peer range excludes TS 6).
- Upgraded all GitHub Actions to latest releases and **pinned every `uses:` line by commit SHA** with a `# v<tag>` comment (closes Scorecard PinnedDependenciesID alerts). `pnpm/action-setup` held on v4 — v6 regressed `ERR_PNPM_BROKEN_LOCKFILE` under `--frozen-lockfile` on a single-document YAML lockfile.
- Dependabot config groups minor/patch npm updates, groups dev-dep majors (ignoring `@types/node` majors — tracks LTS runtime), and groups all action bumps — green CI is the gate, not manual triage of each tag.
- `lint:md` command uses inline negation globs (`!**/node_modules/**`) instead of markdownlint-cli2's `#` ignore syntax — the latter expanded the full glob first on a workspace-scale `node_modules` and hit a 4 GB heap ceiling.

## [0.1.0] — 2026-04-14

### Added

- Initial scaffold: sparse-clone upstream `mbadolato/iTerm2-Color-Schemes`, convert hex → OKLCH via `culori`, classify (`isDark` + tags), validate with Zod, emit `data/themes.json`, `data/themes-slim.json`, `data/index.json`, and `data/by-name/<slug>.json`.
- 20 color keys per theme (background, foreground, cursor, selection, 8 ANSI, 8 bright ANSI).
- ΔE2000 round-trip gate (< 1.0), duplicate-slug guard, pinned upstream SHA in every record.
- Public API: `themeToCssVars`, `convertHexToColor`, `roundTripDeltaE`, `hexFromOklch`, `classifyTheme`, `toSlug`, all Zod schemas.

[Unreleased]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/williamzujkowski/oklch-terminal-themes/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/williamzujkowski/oklch-terminal-themes/releases/tag/v0.1.0
