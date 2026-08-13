// @vitest-environment jsdom

import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const distIndex = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'index.html',
);

// Impacts we treat as a CI failure. `minor` / `moderate` findings are valid
// quality signals but noisy — tracked separately in issue #18.
const BLOCKING_IMPACTS = new Set<string>(['serious', 'critical']);

/**
 * Rules jsdom genuinely cannot decide, each with the reason and what covers it
 * instead. Everything NOT listed here fails the build when axe returns it as
 * `incomplete` (#209).
 *
 * This is an exemption list, not a suppression list: the "stale entries" test
 * below fails if a rule stops being incomplete, so an entry cannot outlive the
 * limitation that justified it. Moving to a real-browser gate (#238) should
 * empty this map.
 */
const JSDOM_CANNOT_RESOLVE = new Map<string, string>([
  [
    'color-contrast',
    'jsdom does not lay out the page, so there is no rendered colour to compare. Real Chrome via Lighthouse CI is the gate for this, and it resolves oklch() correctly.',
  ],
  [
    'landmark-one-main',
    'jsdom cannot confirm the landmark is visible, so axe declines to rule even when the page is correct. Covered deterministically by "has exactly one main landmark".',
  ],
  [
    'page-has-heading-one',
    'same visibility limitation. Covered deterministically by "has exactly one h1".',
  ],
  [
    'aria-valid-attr-value',
    'the combobox\'s `aria-controls` points at the listbox, which ships `hidden`; jsdom cannot resolve visibility so axe declines to rule on whether the reference is live. The reference itself is checked deterministically by "every ARIA id reference resolves".',
  ],
]);

// How many theme options to leave in the listbox before running axe.
//
// jsdom + axe cost scales catastrophically with this list, and — counter-
// intuitively — it gets WORSE when accessibility problems are FIXED. Measured
// on one machine against the built page (issue #238):
//
// | configuration                              | axe run |
// |--------------------------------------------|---------|
// | full listbox, #208 unfixed                 | ~12s    |
// | full listbox, #208 fixed with <span>       | 286s    |
// | full listbox, #208 fixed with tabindex=-1  | 320s    |
// | truncated to 20, #208 fixed                | 1.1s    |
//
// The test's own timeout is 30s, so BOTH shapes of the #208 fix timed out and
// the correct change could not land while the whole list was in play. That is
// the "blocks the a11y fixes" in #238.
//
// Truncating is an interim measure, not a resolution — #238's real answer is
// running axe in a browser, where these rules also stop landing in the
// `incomplete` bucket. It costs little coverage here: every option is emitted
// by one loop in `ThemeSelector.astro` with identical markup, and the swatches
// are `aria-hidden`, so option 21 cannot differ structurally from option 2.
// What it does lose is any bug that only appears at scale — which is exactly
// what a browser-based gate would restore.
const LISTBOX_SAMPLE = 20;

function truncateListbox(): void {
  const items = document.querySelectorAll('.listbox-item');
  for (let i = LISTBOX_SAMPLE; i < items.length; i++) items[i]?.remove();
}

describe('a11y: built index.html (axe wcag2a + wcag2aa + best-practice)', () => {
  let results: axe.AxeResults;

  beforeAll(async () => {
    const raw = await readFile(distIndex, 'utf-8');
    // Strip all inline <script> elements. jsdom can't safely execute our
    // pre-paint scripts (no matchMedia in the VM context), and scripts have
    // no bearing on WCAG structural a11y anyway — axe checks the DOM, ARIA
    // attributes, color contrast, etc.
    //
    // The closing-tag pattern allows optional whitespace inside the tag
    // (`</script >`) and a self-closing `<script ... />`, so a crafted tag
    // cannot survive the strip — see CodeQL js/bad-tag-filter and
    // js/incomplete-multi-character-sanitization.
    const sansScripts = raw.replace(/<script\b[^>]*?(?:\/>|>[\s\S]*?<\/script\s*>)/gi, '');
    document.open();
    document.write(sansScripts);
    document.close();
    truncateListbox();

    // One run, shared by every assertion below — axe over this document is
    // the expensive part, and each check reads a different bucket of the
    // same result.
    //
    // `best-practice` is included deliberately. Without it `landmark-one-main`,
    // `page-has-heading-one`, `heading-order` and `region` are never run,
    // because none of them carries a `wcag2a`/`wcag2aa` tag.
    results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
    });
  }, 60_000);

  it('passes with no serious/critical violations', () => {
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
    if (blocking.length > 0) {
      const lines = blocking.map((v) => `[${v.impact}] ${v.id}: ${v.help}`);
      console.error(`\naxe violations:\n${lines.join('\n')}\n`);
    }
    expect(blocking).toEqual([]);
  });

  it('has no incomplete result outside the documented jsdom limits', () => {
    // The gap this closes (#209): the suite used to read `violations` only and
    // throw `incomplete` away. Three of the bugs fixed in #208 and #216 landed
    // in `incomplete` rather than `violations` — jsdom cannot resolve
    // visibility, so axe declined to rule — and the gate stayed green through
    // all of them.
    //
    // Anything axe cannot decide now fails unless it is on the list below,
    // with a reason and a structural test that covers it instead.
    const unexpected = results.incomplete.filter((r) => !JSDOM_CANNOT_RESOLVE.has(r.id));
    if (unexpected.length > 0) {
      const lines = unexpected.map((r) => `${r.id}: ${r.help} (${r.nodes.length} node(s))`);
      console.error(`\naxe incomplete, not accounted for:\n${lines.join('\n')}\n`);
    }
    expect(unexpected.map((r) => r.id)).toEqual([]);
  });

  it('keeps the jsdom-limitation list free of stale entries', () => {
    // If a rule stops landing in `incomplete` — because a real browser gate
    // replaced this one, or axe improved — the exemption is dead weight that
    // silently suppresses a rule which now works. Removing it should be
    // forced, not remembered.
    const stillIncomplete = new Set(results.incomplete.map((r) => r.id));
    const stale = [...JSDOM_CANNOT_RESOLVE.keys()].filter((id) => !stillIncomplete.has(id));
    expect(stale).toEqual([]);
  });

  it('actually evaluated the structural rules, rather than skipping them', () => {
    // `landmark-one-main` and `page-has-heading-one` are `best-practice`, not
    // `wcag2a`/`wcag2aa`. Scoped to the WCAG tags alone they were not run at
    // all — neither passing nor failing nor incomplete, simply absent, which
    // is why the issue's expectation that they were `incomplete` did not match
    // what the gate produced. `heading-order` and `region` were invisible for
    // the same reason and both pass today.
    const evaluated = new Set(
      [
        ...results.violations,
        ...results.incomplete,
        ...results.passes,
        ...results.inapplicable,
      ].map((r) => r.id),
    );
    for (const id of ['aria-hidden-focus', 'bypass', 'heading-order', 'region']) {
      expect(evaluated.has(id), `${id} was never evaluated`).toBe(true);
    }
  });
});

// Focusable elements keyboard navigation will land on. `[tabindex="-1"]` is
// deliberately excluded: that is the documented way to keep something
// programmatically focusable but out of the tab order.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'details',
  'summary',
  'iframe',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

describe('a11y: nothing focusable hides behind aria-hidden (#208)', () => {
  it('has no tabbable element inside an aria-hidden subtree', () => {
    // Structural rather than axe-driven, and that is the point: axe reports
    // this pattern as `incomplete`, not a violation, because jsdom cannot
    // resolve visibility — so the gate above cannot see it (#209). It also
    // runs in milliseconds regardless of listbox size, so unlike the axe run
    // it does not need the sample above.
    //
    // The showcase is full of decorative panes marked `aria-hidden="true"`,
    // which makes this easy to reintroduce: `ShowcaseReading` shipped two
    // `href="#"` anchors a keyboard user could tab into while screen readers
    // reported nothing (WCAG 4.1.2).
    const offenders: string[] = [];
    for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
      for (const el of hidden.querySelectorAll(FOCUSABLE_SELECTOR)) {
        const label = (el.textContent ?? '').trim().slice(0, 40);
        offenders.push(
          `<${el.tagName.toLowerCase()}> "${label}" inside ${hidden.className || hidden.tagName}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('a11y: document structure (#216)', () => {
  it('has exactly one h1', () => {
    // The showcase heading was also an h1, and it renders as a bare em-dash
    // before JS runs — a no-JS reader or crawler saw a top-level heading
    // containing nothing but punctuation.
    const h1s = Array.from(document.querySelectorAll('h1')).map((h) =>
      (h.textContent ?? '').trim(),
    );
    expect(h1s).toHaveLength(1);
  });

  it('never skips a heading level', () => {
    // Demoting the showcase headings fixed a pre-existing skip as a side
    // effect: `Dashboard` was an h2 whose panels were h4.
    const levels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName[1]),
    );
    const skips: string[] = [];
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1] ?? 0;
      const cur = levels[i] ?? 0;
      if (cur > prev + 1) skips.push(`h${prev} -> h${cur}`);
    }
    expect(skips).toEqual([]);
  });

  it('offers a skip link that targets a real element', () => {
    // A skip link pointing at an id that does not exist is worse than none:
    // it consumes the user's first Tab and then does nothing.
    const link = document.querySelector<HTMLAnchorElement>('.skip-link');
    expect(link, 'no .skip-link in the built page').not.toBeNull();
    const href = link?.getAttribute('href') ?? '';
    expect(href.startsWith('#')).toBe(true);
    expect(document.getElementById(href.slice(1))).not.toBeNull();
  });

  it('puts the skip link first in the tab order', () => {
    const focusable = document.querySelectorAll(FOCUSABLE_SELECTOR);
    expect(focusable[0]?.classList.contains('skip-link')).toBe(true);
  });

  it('has exactly one main landmark', () => {
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });
});

describe('a11y: every ARIA id reference resolves', () => {
  // Backs the `aria-valid-attr-value` exemption above. axe cannot decide it in
  // jsdom because the listbox ships `hidden`, but the part that actually
  // matters — does the id exist — is trivially checkable here, and a dangling
  // IDREF is a real bug that would otherwise hide behind that exemption.
  const IDREF_ATTRS = [
    'aria-controls',
    'aria-labelledby',
    'aria-describedby',
    'aria-activedescendant',
  ];

  it.each(IDREF_ATTRS)('%s targets exist', (attr) => {
    const dangling: string[] = [];
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) {
          dangling.push(`${el.tagName.toLowerCase()}[${attr}="${id}"]`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
