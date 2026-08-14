// Theme data access for the showcase controller.
//
// Extracted from `showcase-controller.ts` (issue #286). This is the one
// cluster in that file with no coupling to the listbox: it answers "which
// theme is selected" and "give me its colours", and nothing here knows that
// a picker exists.
//
// The mutable state lives in an explicit `StoreState` record rather than in
// closure variables. That is what lets the helpers below sit at module scope
// instead of nesting inside the factory — a factory that closes over its
// state is a single enormous function as far as the linter (and a reader) is
// concerned, which is how the original grew to 813 lines unnoticed.
//
// `doc`/`win` are injected for the same reason the controller injects them —
// so a test can drive a fixture document and a controlled URL.

import type { SlimThemeLike } from './formatters';

// themes-slim.json already carries `dataviz.categorical` (issue #150) —
// `SlimThemeLike` (shared with the export-menu formatters) doesn't declare
// it since those formatters never touch it, so it's added here.
export type SlimTheme = SlimThemeLike & { dataviz?: { categorical: string[] } };

export interface ThemeStore {
  /** The slug the URL selects, falling back to the inlined default. */
  currentSlug(): string;
  /** Runs `fn` now if the theme is loaded, otherwise once the fetch lands. */
  withTheme(slug: string, fn: (theme: SlimTheme) => void): void;
  /** Awaits the dataset only if `slug` is not already resolved. */
  resolve(slug: string): Promise<SlimTheme | undefined>;
  /** Starts (or joins) the dataset fetch. */
  loadAll(): Promise<void>;
  /** Whether the page has ever heard of this slug — see `readKnownSlugs`. */
  knows(slug: string): boolean;
}

interface StoreState {
  doc: Document;
  win: Window;
  bySlug: Record<string, SlimTheme>;
  knownSlugs: Set<string>;
  defaultTheme: string;
  /** The in-flight (or settled) dataset fetch; started at most once. */
  ready?: Promise<void>;
}

function readInlined(doc: Document): SlimTheme[] {
  const el = doc.querySelector<HTMLScriptElement>('#themes-data');
  if (!el) return [];
  return JSON.parse(el.textContent ?? '[]') as SlimTheme[];
}

/**
 * Every slug the page knows about, read from the server-rendered options.
 *
 * Slug VALIDITY and theme-data AVAILABILITY are different questions: all 644
 * options ship in the HTML, but their colours do not. Validating against
 * `bySlug` — as this did before the split — would have rejected every theme
 * except the default until the fetch landed, silently ignoring clicks and
 * turning a `?theme=` permalink into the default.
 */
function readKnownSlugs(doc: Document, defaultTheme: string): Set<string> {
  const slugs = new Set(
    Array.from(doc.querySelectorAll<HTMLElement>('.listbox-item')).map(
      (li) => li.dataset.slug ?? '',
    ),
  );
  if (defaultTheme !== '') slugs.add(defaultTheme);
  return slugs;
}

async function fetchThemes(state: StoreState): Promise<void> {
  // Emitted by `index.astro`; falling back to a relative resolve only if the
  // attribute is missing (e.g. an older cached document).
  const src =
    state.doc.querySelector<HTMLElement>('#themes-data')?.dataset.src ??
    new URL('themes-data.json', state.doc.baseURI).toString();
  try {
    const res = await state.win.fetch(src);
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
    for (const t of (await res.json()) as SlimTheme[]) state.bySlug[t.slug] ??= t;
  } catch (err) {
    console.error('theme data failed to load; only the default theme is available', err);
  }
}

/**
 * Resolves once the full dataset has been merged into `bySlug`.
 *
 * Started at init rather than on first interaction, deliberately. #211
 * proposed deferring to first interaction, but the busiest entry path is a
 * shared `?theme=<slug>` permalink, which needs a theme that is not inlined
 * before the user does anything at all. Starting now means the request is in
 * flight while the document is still parsing — and the document is ~680 KB
 * smaller than it was, so parsing finishes sooner too.
 *
 * A failure is non-fatal: the default theme stays rendered, and the listbox
 * still filters and sorts, because all of that reads the server-rendered
 * options rather than this data.
 */
function loadAll(state: StoreState): Promise<void> {
  state.ready ??= fetchThemes(state);
  return state.ready;
}

function currentSlug(state: StoreState): string {
  const url = new URLSearchParams(state.win.location.search);
  const val = url.get('theme');
  if (val !== null && state.knownSlugs.has(val)) return val;
  return state.defaultTheme;
}

function withTheme(state: StoreState, slug: string, fn: (theme: SlimTheme) => void): void {
  const known = state.bySlug[slug];
  if (known) {
    fn(known);
    return;
  }
  void loadAll(state).then(() => {
    const theme = state.bySlug[slug];
    if (theme) fn(theme);
  });
}

async function resolve(state: StoreState, slug: string): Promise<SlimTheme | undefined> {
  // May not be loaded yet if the user reaches for the menu before the dataset
  // lands (#211). Callers are already async, so awaiting the in-flight
  // request costs nothing once it has resolved.
  const known = state.bySlug[slug];
  if (known) return known;
  await loadAll(state);
  return state.bySlug[slug];
}

export function createThemeStore(doc: Document, win: Window): ThemeStore {
  // Only the default theme is inlined (issue #211); the rest arrives from
  // `themes-data.json`. `bySlug` therefore starts nearly empty and fills in.
  const bySlug: Record<string, SlimTheme> = {};
  for (const t of readInlined(doc)) bySlug[t.slug] = t;
  const defaultTheme = Object.keys(bySlug)[0] ?? '';

  const state: StoreState = {
    doc,
    win,
    bySlug,
    defaultTheme,
    knownSlugs: readKnownSlugs(doc, defaultTheme),
  };

  return {
    currentSlug: () => currentSlug(state),
    withTheme: (slug, fn) => {
      withTheme(state, slug, fn);
    },
    resolve: (slug) => resolve(state, slug),
    loadAll: () => loadAll(state),
    knows: (slug) => state.knownSlugs.has(slug),
  };
}
