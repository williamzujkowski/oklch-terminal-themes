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

describe('a11y: built index.html (axe wcag2a + wcag2aa)', () => {
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
  });

  it('passes with no serious/critical violations', async () => {
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
    if (blocking.length > 0) {
      const lines = blocking.map((v) => `[${v.impact}] ${v.id}: ${v.help}`);
      console.error(`\naxe violations:\n${lines.join('\n')}\n`);
    }
    expect(blocking).toEqual([]);
  }, 30_000);
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
