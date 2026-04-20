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

describe('a11y: built index.html (axe wcag2a + wcag2aa)', () => {
  beforeAll(async () => {
    const raw = await readFile(distIndex, 'utf-8');
    // Strip all inline <script> contents. jsdom can't safely execute our
    // pre-paint scripts (no matchMedia in the VM context), and scripts have
    // no bearing on WCAG structural a11y anyway — axe checks the DOM, ARIA
    // attributes, color contrast, etc.
    const sansScripts = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    document.open();
    document.write(sansScripts);
    document.close();
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
