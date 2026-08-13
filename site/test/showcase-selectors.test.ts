// @vitest-environment jsdom

// Anti-drift guard for the controller tests.
//
// `showcase-controller.test.ts` drives a hand-written fixture rather than the
// real page, which is fast and hermetic but has an obvious failure mode: the
// components can rename a class or drop a data attribute and the fixture keeps
// happily testing the old contract. Every selector `ShowcaseController` reads
// is therefore asserted against BOTH the fixture and the actual built HTML.
//
// Requires `astro build` first, so this runs as its own CI step after the site
// build — same arrangement as `a11y.test.ts`.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures/showcase-dom';

const distIndex = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'index.html',
);

/**
 * Every selector `src/lib/showcase-controller.ts` queries.
 *
 * When the controller learns a new selector, add it here — that is the only
 * manual step keeping this guard honest.
 */
const SELECTORS = [
  '#themes-data',
  '.showcase',
  '[data-theme-name]',
  '[data-theme-meta]',
  '[data-wcag-badge]',
  '[data-wcag-level]',
  '[data-wcag-ratio]',
  '.showcase-palette',
  '.palette-chip',
  '.palette-chip [data-value]',
  '[data-viz-bar]',
  '.viz-chips > li',
  '.viz-chip',
  '.viz-chip-swatch',
  '[data-theme-announcer]',
  '.combo-trigger',
  '[data-combo-label]',
  '[data-combo-meta]',
  '#theme-listbox',
  '#theme-search',
  '#theme-sort',
  '#listbox-count',
  '.listbox-list',
  '.listbox-item',
  '.listbox-empty',
  '.listbox-tags .tag-chip[data-tag]',
  '.listbox-tags [data-action="reset-filters"]',
  '[data-nav]',
  '[data-action="random"]',
  '.export-menu summary',
  '[data-export]',
  '[data-toast]',
];

/** Data attributes the controller reads off each `.listbox-item`. */
const OPTION_DATA_KEYS = ['slug', 'name', 'dark', 'tags', 'apca'];

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const built = parse(readFileSync(distIndex, 'utf-8'));
const fake = parse(`<body>${fixture()}</body>`);

describe('controller selectors exist in the built page', () => {
  it.each(SELECTORS)('%s', (selector) => {
    expect(
      built.querySelector(selector),
      `missing from dist/index.html: ${selector}`,
    ).not.toBeNull();
  });

  it.each(OPTION_DATA_KEYS)('.listbox-item carries data-%s', (dataKey) => {
    const li = built.querySelector<HTMLElement>('.listbox-item');
    expect(li?.dataset[dataKey]).toBeDefined();
  });

  it('gives every option a non-empty id for aria-activedescendant', () => {
    // Keyboard navigation points `aria-activedescendant` at the option's id.
    // Options without one are silently unreachable for screen readers.
    const ids = Array.from(built.querySelectorAll<HTMLElement>('.listbox-item')).map((li) => li.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => id === '')).toEqual([]);
  });
});

describe('the test fixture matches the built page', () => {
  it.each(SELECTORS)('%s', (selector) => {
    expect(
      fake.querySelector(selector),
      `missing from the test fixture: ${selector}`,
    ).not.toBeNull();
  });

  it.each(OPTION_DATA_KEYS)('.listbox-item carries data-%s', (dataKey) => {
    const li = fake.querySelector<HTMLElement>('.listbox-item');
    expect(li?.dataset[dataKey]).toBeDefined();
  });

  it('parses the embedded themes payload the same way the controller does', () => {
    const el = fake.querySelector('#themes-data');
    const themes = JSON.parse(el?.textContent ?? '[]') as Array<{ slug: string }>;
    expect(themes.length).toBeGreaterThan(0);
    expect(themes[0]?.slug).toBeTruthy();
  });
});
