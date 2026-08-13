// The picker's client-side controller.
//
// Extracted from `ShowcaseController.astro` (issue #178), which held ~630
// lines of behaviour inside a single `<script>` tag — the largest untested
// unit in the repo. Nothing about it needed to live in the component: it is
// DOM orchestration, and taking `doc`/`win` as parameters makes all of it
// reachable from jsdom.
//
// `doc`/`win` are injected rather than read off the globals so a test can
// drive a fixture document and a controlled URL. Production still passes the
// real `document`/`window` from the component's inline script.
//
// All state is URL-driven: `?theme=<slug>`, `?q=`, `?tags=`, `?sort=`.

import {
  matches,
  parseFilterFromUrl,
  writeFilterToUrl,
  parseSortFromUrl,
  writeSortToUrl,
  type FilterState,
  type SortMode,
} from './theme-filter';
import {
  formatCssVars,
  formatTailwindTheme,
  formatJson,
  formatPermalink,
  formatRatio,
  wcagLabel,
  type SlimThemeLike,
} from './formatters';

// themes-slim.json already carries `dataviz.categorical` (issue #150) —
// `SlimThemeLike` (shared with the export-menu formatters) doesn't declare
// it since those formatters never touch it, so it's added locally here.
type SlimTheme = SlimThemeLike & { dataviz?: { categorical: string[] } };

/**
 * Wires every control in the showcase to the injected document.
 *
 * Call once per document. All listener registration and the initial
 * `applyTheme()` happen here.
 *
 * Returns a disposer that removes every listener this call registered. The
 * page never needs it — there is one controller per page load — but the
 * `doc`/`win` listeners outlive `document.body.innerHTML = ...`, so without
 * a way to detach them a second `init` leaves the first one live and both
 * respond to `popstate`. That is a re-entrancy bug whether or not a test is
 * the thing that trips it.
 */
export function initShowcaseController(doc: Document, win: Window): () => void {
  const listeners = new AbortController();
  const { signal } = listeners;

  function readThemes(): SlimTheme[] {
    const el = doc.querySelector<HTMLScriptElement>('#themes-data');
    if (!el) return [];
    return JSON.parse(el.textContent ?? '[]') as SlimTheme[];
  }

  // camelCase (colors.brightRed) → kebab (--tt-bright-red)
  function toCssVar(key: string): string {
    return '--tt-' + key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  const THEMES = readThemes();
  const BY_SLUG: Record<string, SlimTheme> = {};
  for (const t of THEMES) BY_SLUG[t.slug] = t;

  const DEFAULT_THEME = BY_SLUG['dracula'] ? 'dracula' : (THEMES[0]?.slug ?? '');

  function currentSlug(): string {
    const url = new URLSearchParams(win.location.search);
    const val = url.get('theme');
    if (val !== null && val in BY_SLUG) return val;
    return DEFAULT_THEME;
  }

  function applyTheme(): void {
    const showcase = doc.querySelector<HTMLElement>('.showcase');
    if (!showcase) return;
    const slug = currentSlug();
    const theme = BY_SLUG[slug];
    if (!theme) return;
    const nameEl = showcase.querySelector<HTMLElement>('[data-theme-name]');
    const metaEl = showcase.querySelector<HTMLElement>('[data-theme-meta]');
    if (nameEl) nameEl.textContent = theme.name;
    if (metaEl) metaEl.textContent = `${theme.isDark ? 'dark' : 'light'} · ${theme.slug}`;

    const badge = showcase.querySelector<HTMLElement>('[data-wcag-badge]');
    if (badge && theme.contrast) {
      const level = wcagLabel(theme.contrast.fgOnBg);
      badge.dataset.wcagLevel = level;
      const levelEl = badge.querySelector<HTMLElement>('[data-wcag-level]');
      const ratioEl = badge.querySelector<HTMLElement>('[data-wcag-ratio]');
      if (levelEl) levelEl.textContent = level;
      if (ratioEl) ratioEl.textContent = formatRatio(theme.contrast.fgOnBg);
      badge.hidden = false;
    }

    for (const [k, v] of Object.entries(theme.colors)) {
      showcase.style.setProperty(toCssVar(k), v);
    }

    const palette = showcase.querySelector<HTMLElement>('.showcase-palette');
    if (palette) {
      for (const chip of palette.querySelectorAll<HTMLElement>('.palette-chip')) {
        const key = chip.dataset.key ?? '';
        const valueEl = chip.querySelector<HTMLElement>('[data-value]');
        if (valueEl) valueEl.textContent = theme.colors[key] ?? '';
      }
    }

    const combo = doc.querySelector<HTMLElement>('.combo-trigger');
    if (combo) {
      const label = combo.querySelector<HTMLElement>('[data-combo-label]');
      const meta = combo.querySelector<HTMLElement>('[data-combo-meta]');
      if (label) label.textContent = theme.name;
      if (meta) meta.textContent = `${theme.isDark ? 'dark' : 'light'} · ${theme.slug}`;
    }

    // Dataviz categorical palette (issue #158) — 6-8 stub bars/chips are
    // pre-rendered; anything past this theme's categorical length is hidden
    // rather than removed, so switching themes never has to re-create nodes.
    const categorical = theme.dataviz?.categorical ?? [];
    const vizBars = showcase.querySelectorAll<HTMLElement>('[data-viz-bar]');
    vizBars.forEach((bar, i) => {
      const color = categorical[i];
      if (color !== undefined) {
        bar.style.setProperty('--viz-color', color);
        bar.hidden = false;
      } else {
        bar.hidden = true;
      }
    });
    const vizChipItems = showcase.querySelectorAll<HTMLLIElement>('.viz-chips > li');
    vizChipItems.forEach((li, i) => {
      const color = categorical[i];
      const swatch = li.querySelector<HTMLElement>('.viz-chip-swatch');
      const valueEl = li.querySelector<HTMLElement>('[data-value]');
      if (color !== undefined) {
        if (swatch) swatch.style.setProperty('--viz-color', color);
        if (valueEl) valueEl.textContent = color;
        li.hidden = false;
      } else {
        li.hidden = true;
      }
    });

    announceTheme(theme);
  }

  /**
   * Announce the active theme to assistive tech (issue #210).
   *
   * Changing the theme rewrites the heading, the meta line, the WCAG badge
   * and 20 palette values, none of which is announced — a screen-reader user
   * pressing arrow keys to browse got total silence.
   *
   * Deliberately terse: this fires on every arrow keypress, so verbosity
   * becomes noise. Contrast is included because it is the one number a user
   * is likely browsing *for*, and it uses the same rounded-down string the
   * badge shows so the two never disagree.
   *
   * Skipped on first paint — announcing the theme the page merely loaded
   * with would talk over a user who has not asked for anything yet.
   */
  let hasAnnounced = false;
  function announceTheme(theme: SlimTheme): void {
    const region = doc.querySelector<HTMLElement>('[data-theme-announcer]');
    if (!region) return;
    if (!hasAnnounced) {
      hasAnnounced = true;
      return;
    }
    const polarity = theme.isDark ? 'dark' : 'light';
    const contrast =
      theme.contrast === undefined
        ? ''
        : `, contrast ${formatRatio(theme.contrast.fgOnBg)} ${wcagLabel(theme.contrast.fgOnBg)}`;
    region.textContent = `${theme.name}, ${polarity}${contrast}`;
  }

  function setSlug(slug: string): void {
    if (!(slug in BY_SLUG)) return;
    const next = new URL(win.location.href);
    next.searchParams.set('theme', slug);
    win.history.replaceState(null, '', next.toString());
    applyTheme();
  }

  // ===== Listbox (filters + list) =====
  const listbox = doc.querySelector<HTMLElement>('#theme-listbox');
  const searchInput = doc.querySelector<HTMLInputElement>('#theme-search');
  const tagChips = Array.from(
    doc.querySelectorAll<HTMLButtonElement>('.listbox-tags .tag-chip[data-tag]'),
  );
  const resetBtn = doc.querySelector<HTMLButtonElement>(
    '.listbox-tags [data-action="reset-filters"]',
  );
  const countEl = doc.querySelector<HTMLOutputElement>('#listbox-count');
  const listItems = Array.from(doc.querySelectorAll<HTMLElement>('.listbox-item'));
  const emptyEl = doc.querySelector<HTMLElement>('.listbox-empty');

  let listboxOpen = false;
  let filterState: FilterState = parseFilterFromUrl(win.location.search);

  // ===== Sort (issue #158: sort-by-APCA) =====
  const sortSelect = doc.querySelector<HTMLSelectElement>('#theme-sort');
  // Capture the build-time order (popular-first, then name — see
  // ThemeSelector.astro's `.sort()`) so switching back to 'default' always
  // restores it, even after an 'apca' reorder has moved <li> nodes around.
  const originalOrder = [...listItems];
  let sortMode: SortMode = parseSortFromUrl(win.location.search);

  // Reorders the actual <li> DOM nodes (not a virtual list — see the file
  // header comment), so prev/next/random and keyboard navigation step through
  // themes in the chosen sort order too — both go through `visibleItems()`,
  // which queries the DOM.
  //
  // That was previously only true of the comment: `visibleSlugs()` read the
  // captured `listItems` array, which `applySort` never touches (issue #214).
  function applySort(mode: SortMode): void {
    const list = doc.querySelector<HTMLElement>('.listbox-list');
    if (!list) return;
    const ordered =
      mode === 'apca'
        ? [...listItems].sort((a, b) => {
            const av = Number.parseFloat(a.dataset.apca ?? '0');
            const bv = Number.parseFloat(b.dataset.apca ?? '0');
            return bv - av || (a.dataset.slug ?? '').localeCompare(b.dataset.slug ?? '');
          })
        : originalOrder;
    for (const li of ordered) list.appendChild(li);
  }

  if (sortSelect) sortSelect.value = sortMode;
  applySort(sortMode);

  sortSelect?.addEventListener(
    'change',
    () => {
      sortMode = sortSelect.value === 'apca' ? 'apca' : 'default';
      applySort(sortMode);
      const url = writeSortToUrl(sortMode, new URL(win.location.href));
      win.history.replaceState(null, '', url.toString());
    },
    { signal },
  );

  function applyFilters(): void {
    let visible = 0;
    for (const li of listItems) {
      // #212: this used to derive `name` as `data-search.split(' ')[0]` — the
      // FIRST WORD ONLY — and then AND that truncated match against a
      // separate full-blob check. The two disagreed, so any query containing
      // a space matched the blob but failed `matches()` and returned nothing:
      // "solarized dark" and "higher contrast" were both unreachable. Now
      // there is one path, fed the real name.
      const t = {
        slug: li.dataset.slug ?? '',
        name: li.dataset.name ?? '',
        isDark: li.dataset.dark === 'true',
        tags: (li.dataset.tags ?? '').split(' ').filter(Boolean),
      };
      const ok = matches(t, filterState);
      li.hidden = !ok;
      if (ok) visible++;
    }
    if (countEl) {
      countEl.textContent = `${visible.toLocaleString()} of ${listItems.length.toLocaleString()} themes`;
    }
    if (emptyEl) emptyEl.hidden = visible > 0;
    // The active option may have just been filtered out; re-seat the virtual
    // cursor on the first still-visible row so ArrowDown/Enter stay coherent
    // as the user types (#206).
    if (listboxOpen) setActiveOption(visible > 0 ? 0 : -1);
    const url = writeFilterToUrl(filterState, new URL(win.location.href));
    win.history.replaceState(null, '', url.toString());
  }

  function openListbox(): void {
    if (!listbox) return;
    listboxOpen = true;
    listbox.hidden = false;
    const combo = doc.querySelector<HTMLElement>('.combo-trigger');
    combo?.setAttribute('aria-expanded', 'true');
    // Highlight current selection
    const slug = currentSlug();
    for (const li of listItems) {
      li.setAttribute('aria-selected', li.dataset.slug === slug ? 'true' : 'false');
    }
    if (searchInput) {
      searchInput.value = filterState.query;
      searchInput.focus();
      searchInput.select();
    }
    applyFilters();
    // Start the virtual cursor on the current theme so Enter is immediately
    // meaningful and screen readers announce a position on open (#206).
    setActiveOption(visibleItems().findIndex((li) => li.dataset.slug === slug));
  }

  // ===== Listbox keyboard navigation (#206) =====
  //
  // Options carry no tabindex and are never focused: focus stays in the
  // search field so typing keeps filtering, and `aria-activedescendant`
  // carries the virtual cursor. That is the ARIA APG editable-combobox
  // pattern, and it is what makes the picker operable without a mouse — the
  // list previously bound `click` only, so a keyboard user could filter but
  // had no way to commit a selection.

  let activeIndex = -1;

  /**
   * Visible options **in the order they are rendered**.
   *
   * Queries the DOM rather than filtering `listItems` (issue #214).
   * `listItems` is captured once at load and stays in build order forever;
   * `applySort` reorders the <li> nodes, not that array. Reading the array
   * therefore stepped through themes in popular-then-name order even with
   * `?sort=apca` active — for both keyboard navigation and prev/next/random.
   *
   * Every other use of `listItems` (filtering, counting, clearing the active
   * class) is order-independent, so those keep using the cheaper captured
   * array.
   */
  function visibleItems(): HTMLElement[] {
    return Array.from(doc.querySelectorAll<HTMLElement>('.listbox-list .listbox-item')).filter(
      (li) => !li.hidden,
    );
  }

  function setActiveOption(index: number): void {
    const items = visibleItems();
    for (const li of listItems) li.classList.remove('is-active');

    if (items.length === 0 || index < 0) {
      activeIndex = -1;
      searchInput?.removeAttribute('aria-activedescendant');
      return;
    }

    activeIndex = Math.max(0, Math.min(index, items.length - 1));
    const li = items[activeIndex];
    if (!li) return;
    li.classList.add('is-active');
    if (li.id) searchInput?.setAttribute('aria-activedescendant', li.id);
    li.scrollIntoView({ block: 'nearest' });
  }

  function moveActive(delta: number): void {
    const items = visibleItems();
    if (items.length === 0) return;
    // Clamp rather than wrap: wrapping from the end back to the top of a
    // 633-item list is disorienting when you cannot see the whole list.
    //
    // The `Math.max` matters: `setActiveOption` treats a negative index as
    // "no active option" and drops `aria-activedescendant` entirely, so
    // without it ArrowUp on the first row silently deselected instead of
    // clamping — the opposite of what this comment promised.
    const from = activeIndex === -1 ? (delta > 0 ? -1 : items.length) : activeIndex;
    setActiveOption(Math.max(0, from + delta));
  }

  function commitActiveOption(): void {
    const li = visibleItems()[activeIndex];
    if (!li) return;
    setSlug(li.dataset.slug ?? '');
    closeListbox();
  }

  searchInput?.addEventListener(
    'keydown',
    (ev) => {
      switch (ev.key) {
        case 'ArrowDown':
          ev.preventDefault();
          moveActive(1);
          break;
        case 'ArrowUp':
          ev.preventDefault();
          moveActive(-1);
          break;
        case 'Home':
          ev.preventDefault();
          setActiveOption(0);
          break;
        case 'End':
          ev.preventDefault();
          setActiveOption(visibleItems().length - 1);
          break;
        case 'Enter':
          ev.preventDefault();
          commitActiveOption();
          break;
      }
    },
    { signal },
  );

  function closeListbox(): void {
    if (!listbox) return;
    listbox.hidden = true;
    listboxOpen = false;
    const combo = doc.querySelector<HTMLElement>('.combo-trigger');
    combo?.setAttribute('aria-expanded', 'false');
    // Focus was on the search field, which is now inside a hidden subtree —
    // without this it falls back to <body> and the user's tab position is
    // lost after every selection and every Escape (#211).
    combo?.focus();
  }

  // Wire combobox trigger
  doc.querySelector<HTMLElement>('.combo-trigger')?.addEventListener(
    'click',
    () => {
      if (listboxOpen) closeListbox();
      else openListbox();
    },
    { signal },
  );

  // Close listbox when clicking outside
  doc.addEventListener(
    'click',
    (ev) => {
      if (!listbox || listbox.hidden) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#theme-listbox') || target.closest('.combo-trigger')) return;
      closeListbox();
    },
    { signal },
  );

  // Listbox item click
  for (const li of listItems) {
    li.addEventListener(
      'click',
      () => {
        const slug = li.dataset.slug ?? '';
        setSlug(slug);
        closeListbox();
      },
      { signal },
    );
  }

  // Search + chips
  searchInput?.addEventListener(
    'input',
    () => {
      filterState = { query: searchInput.value.trim(), tags: new Set(filterState.tags) };
      applyFilters();
    },
    { signal },
  );
  for (const chip of tagChips) {
    chip.addEventListener(
      'click',
      () => {
        const tag = chip.dataset.tag ?? '';
        const next = new Set(filterState.tags);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        chip.setAttribute('aria-pressed', next.has(tag) ? 'true' : 'false');
        filterState = { query: filterState.query, tags: next };
        applyFilters();
      },
      { signal },
    );
  }
  resetBtn?.addEventListener(
    'click',
    () => {
      filterState = { query: '', tags: new Set() };
      if (searchInput) searchInput.value = '';
      for (const chip of tagChips) chip.setAttribute('aria-pressed', 'false');
      applyFilters();
    },
    { signal },
  );

  // Sync tag chip pressed state with URL state on load
  for (const chip of tagChips) {
    const tag = chip.dataset.tag ?? '';
    if (filterState.tags.has(tag)) chip.setAttribute('aria-pressed', 'true');
  }

  // ===== Prev / Next / Random =====
  function visibleSlugs(): string[] {
    return visibleItems().map((li) => li.dataset.slug ?? '');
  }

  function step(delta: number): void {
    const slugs = visibleSlugs();
    if (slugs.length === 0) return;
    const current = currentSlug();
    const idx = slugs.indexOf(current);
    const next = slugs[(idx + delta + slugs.length) % slugs.length];
    if (next !== undefined) setSlug(next);
  }

  for (const btn of doc.querySelectorAll<HTMLElement>('[data-nav]')) {
    btn.addEventListener(
      'click',
      () => {
        step(btn.dataset.nav === 'next' ? 1 : -1);
      },
      { signal },
    );
  }

  doc.querySelector<HTMLElement>('[data-action="random"]')?.addEventListener(
    'click',
    () => {
      const slugs = visibleSlugs();
      if (slugs.length === 0) return;
      const pick = slugs[Math.floor(Math.random() * slugs.length)];
      if (pick) setSlug(pick);
    },
    { signal },
  );

  // ===== Export menu =====
  async function copy(text: string): Promise<boolean> {
    if (!win.navigator.clipboard) return false;
    try {
      await win.navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function flashExport(msg: string, ok: boolean): void {
    const summary = doc.querySelector<HTMLElement>('.export-menu summary');
    if (!summary) return;
    summary.dataset.feedback = msg;
    summary.dataset.feedbackOk = ok ? 'true' : 'false';
    win.setTimeout(() => {
      delete summary.dataset.feedback;
      delete summary.dataset.feedbackOk;
    }, 1800);
  }

  for (const btn of doc.querySelectorAll<HTMLButtonElement>('[data-export]')) {
    btn.addEventListener(
      'click',
      async () => {
        const slug = currentSlug();
        const theme = BY_SLUG[slug];
        if (!theme) return;
        const action = btn.dataset.export;
        let text = '';
        if (action === 'css') text = formatCssVars(theme);
        else if (action === 'tailwind') text = formatTailwindTheme(theme);
        else if (action === 'json') text = formatJson(theme);
        else if (action === 'permalink')
          // origin + pathname only, never the full href: `location.href`
          // carries whatever ?q=/?tags=/?sort= the sender happened to have, so
          // a shared link silently opened a filtered view the recipient never
          // chose (#219).
          text = formatPermalink(slug, new URL(win.location.pathname, win.location.origin));
        const ok = await copy(text);
        flashExport(
          ok ? `copied ${action === 'permalink' ? 'permalink' : action}` : 'clipboard blocked',
          ok,
        );
        // Close the <details>
        const details = btn.closest<HTMLDetailsElement>('details');
        if (details) details.open = false;
      },
      { signal },
    );
  }

  // ===== Palette chip copy =====
  for (const chip of doc.querySelectorAll<HTMLButtonElement>('.palette-chip')) {
    chip.addEventListener(
      'click',
      async () => {
        const slug = currentSlug();
        const theme = BY_SLUG[slug];
        if (!theme) return;
        const key = chip.dataset.key ?? '';
        const value = theme.colors[key];
        if (!value) return;
        const ok = await copy(value);
        const toast = doc.querySelector<HTMLElement>('[data-toast]');
        if (toast) {
          toast.textContent = ok ? `copied ${value}` : 'clipboard blocked';
          toast.dataset.visible = 'true';
          win.setTimeout(() => {
            toast.dataset.visible = 'false';
          }, 1800);
        }
      },
      { signal },
    );
  }

  // ===== Dataviz swatch copy (issue #158) — same toast as the palette chips =====
  for (const chip of doc.querySelectorAll<HTMLButtonElement>('.viz-chip')) {
    chip.addEventListener(
      'click',
      async () => {
        const slug = currentSlug();
        const theme = BY_SLUG[slug];
        if (!theme) return;
        const idx = Number.parseInt(chip.dataset.vizSwatch ?? '-1', 10);
        const color = theme.dataviz?.categorical[idx];
        if (!color) return;
        const ok = await copy(color);
        const toast = doc.querySelector<HTMLElement>('[data-toast]');
        if (toast) {
          toast.textContent = ok ? `copied ${color}` : 'clipboard blocked';
          toast.dataset.visible = 'true';
          win.setTimeout(() => {
            toast.dataset.visible = 'false';
          }, 1800);
        }
      },
      { signal },
    );
  }

  // ===== Keyboard =====
  function typingIntoEditable(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    return (
      t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable
    );
  }

  // A printable-character shortcut may only fire when nothing focusable owns
  // the keystroke. `typingIntoEditable` catches inputs; this also catches
  // buttons, links and anything else with focus.
  function focusIsOnBody(): boolean {
    const active = doc.activeElement;
    return active === null || active === doc.body || active === doc.documentElement;
  }

  doc.addEventListener(
    'keydown',
    (ev) => {
      if (typingIntoEditable(ev.target)) {
        if (ev.key === 'Escape' && listbox && !listbox.hidden) {
          ev.preventDefault();
          closeListbox();
        }
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      switch (ev.key) {
        case '/':
          if (!focusIsOnBody()) return;
          ev.preventDefault();
          openListbox();
          break;
        case 'ArrowLeft':
          ev.preventDefault();
          step(-1);
          break;
        case 'ArrowRight':
          ev.preventDefault();
          step(1);
          break;
        case 'r':
        case 'R':
          // WCAG 2.1.4 Character Key Shortcuts: a single-key shortcut must be
          // remappable, turn-off-able, or active only on focus. `typingIntoEditable`
          // above covers inputs, but with focus on any BUTTON -- a palette chip,
          // a tag filter -- pressing `r` still fired. Restricting it to when
          // focus is on the page body satisfies the "active only on focus"
          // exception without adding a settings UI (#219).
          //
          // Arrow keys are exempt from 2.1.4 (not character keys) and `/` is
          // handled the same way for consistency.
          if (!focusIsOnBody()) return;
          ev.preventDefault();
          doc.querySelector<HTMLElement>('[data-action="random"]')?.click();
          break;
        case 'Escape':
          if (listbox && !listbox.hidden) {
            ev.preventDefault();
            closeListbox();
          }
          break;
      }
    },
    { signal },
  );

  // ===== Init =====
  //
  // `applyFilters` has to run here, not just when the picker opens: `?q=` and
  // `?tags=` arrive from shared permalinks, and everything downstream reads
  // visibility off the DOM. Without this, a link with `?tags=light` left every
  // row visible until the user opened the listbox, so prev/next/random stepped
  // through the whole corpus and the count claimed all 633 matched.
  if (searchInput) searchInput.value = filterState.query;
  applyFilters();
  applyTheme();

  win.addEventListener(
    'popstate',
    () => {
      filterState = parseFilterFromUrl(win.location.search);
      if (searchInput) searchInput.value = filterState.query;
      for (const chip of tagChips) {
        const tag = chip.dataset.tag ?? '';
        chip.setAttribute('aria-pressed', filterState.tags.has(tag) ? 'true' : 'false');
      }
      applyFilters();
      sortMode = parseSortFromUrl(win.location.search);
      if (sortSelect) sortSelect.value = sortMode;
      applySort(sortMode);
      applyTheme();
    },
    { signal },
  );

  return () => {
    listeners.abort();
  };
}
