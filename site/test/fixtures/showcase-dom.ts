// Shared fixture for the showcase controller tests.
//
// `showcase-selectors.test.ts` checks this markup against the real built
// `dist/index.html`, so a fixture that drifts away from the components fails
// CI rather than quietly testing itself.

// Three themes are enough to exercise ordering, filtering and fallback while
// staying readable.
//
// The `apca` values are chosen so descending-APCA is the REVERSE cycle of
// build order, not a rotation of it. prev/next wrap, so a rotation would step
// through the same sequence either way and a sort-vs-navigation mismatch
// (#214) would pass by coincidence — an earlier draft of this fixture did
// exactly that. `data-apca` is `Math.abs(apca.fgOnBg)` in ThemeSelector, so
// these are positive like the real ones.
export const THEMES = [
  {
    name: 'Dracula',
    slug: 'dracula',
    isDark: true,
    apca: 97.0,
    tags: ['dark', 'popular', 'vibrant'],
    contrast: { fgOnBg: 8.2 },
    colors: { background: 'oklch(0.2 0.03 285)', foreground: 'oklch(0.95 0.02 285)' },
    dataviz: { categorical: ['oklch(0.7 0.2 20)', 'oklch(0.7 0.2 140)'] },
  },
  {
    name: 'Solarized Dark',
    slug: 'solarized-dark',
    isDark: true,
    apca: 57.5,
    tags: ['dark', 'popular', 'muted'],
    contrast: { fgOnBg: 4.6 },
    colors: { background: 'oklch(0.25 0.02 200)', foreground: 'oklch(0.7 0.02 200)' },
    dataviz: { categorical: ['oklch(0.6 0.15 40)'] },
  },
  {
    name: 'Nord Light',
    slug: 'nord-light',
    isDark: false,
    apca: 77.5,
    tags: ['light', 'muted'],
    contrast: { fgOnBg: 3.1 },
    colors: { background: 'oklch(0.98 0.01 250)', foreground: 'oklch(0.3 0.02 250)' },
    dataviz: { categorical: ['oklch(0.5 0.12 250)', 'oklch(0.5 0.12 90)', 'oklch(0.5 0.12 330)'] },
  },
];

export const ALL_TAGS = ['dark', 'light', 'popular', 'muted', 'vibrant'];

// Mirrors the markup ShowcaseController depends on. `test/showcase-selectors`
// asserts against the real built HTML that this fixture has not drifted, so a
// green suite here cannot mean "the fixture agrees with itself".
export function fixture(): string {
  const options = THEMES.map(
    (t) => `<li id="theme-opt-${t.slug}" class="listbox-item" role="option" aria-selected="false"
        data-slug="${t.slug}" data-name="${t.name}" data-dark="${t.isDark}"
        data-tags="${t.tags.join(' ')}" data-apca="${t.apca.toFixed(1)}">${t.name}</li>`,
  ).join('\n');
  const chips = ALL_TAGS.map(
    (tag) =>
      `<button type="button" class="tag-chip" data-tag="${tag}" aria-pressed="false">${tag}</button>`,
  ).join('\n');
  // Two viz bars/chips, but Nord Light has three categorical colours — the
  // extra one must simply not render rather than crash.
  const vizBars = [0, 1].map((i) => `<div data-viz-bar hidden></div>`).join('');
  const vizChips = [0, 1]
    .map(
      (i) =>
        `<li hidden><button class="viz-chip" data-viz-swatch="${i}"><span class="viz-chip-swatch"></span><code data-value></code></button></li>`,
    )
    .join('');

  return `
    <script type="application/json" id="themes-data">${JSON.stringify(THEMES)}</script>
    <div class="showcase">
      <h2 data-theme-name></h2>
      <p data-theme-meta></p>
      <span data-wcag-badge hidden><b data-wcag-level></b><i data-wcag-ratio></i></span>
      <div class="showcase-palette">
        <button class="palette-chip" data-key="background"><code data-value></code></button>
        <button class="palette-chip" data-key="foreground"><code data-value></code></button>
      </div>
      <div class="viz-bars">${vizBars}</div>
      <ul class="viz-chips">${vizChips}</ul>
    </div>
    <p data-theme-announcer role="status"></p>
    <button class="combo-trigger" aria-expanded="false">
      <span data-combo-label></span><span data-combo-meta></span>
    </button>
    <div id="theme-listbox" hidden>
      <input id="theme-search" type="text" role="combobox" aria-controls="theme-listbox-list" />
      <div class="listbox-tags" role="group">
        ${chips}
        <button type="button" class="tag-chip reset" data-action="reset-filters">reset</button>
      </div>
      <select id="theme-sort"><option value="default">default</option><option value="apca">apca</option></select>
      <output class="listbox-count" id="listbox-count"></output>
      <ul id="theme-listbox-list" class="listbox-list" role="listbox">${options}</ul>
      <p class="listbox-empty" hidden>No themes match your filters.</p>
    </div>
    <nav>
      <button data-nav="prev">prev</button>
      <button data-nav="next">next</button>
      <button data-action="random">random</button>
    </nav>
    <details class="export-menu">
      <summary>export</summary>
      <button data-export="css">css</button>
      <button data-export="permalink">permalink</button>
    </details>
    <div data-toast data-visible="false"></div>
  `;
}
