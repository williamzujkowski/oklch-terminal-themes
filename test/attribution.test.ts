import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The README's Attribution table is a licensing document, not decoration: it
// tells a redistributor which upstream a theme came from and under what terms.
// It was previously hand-written and had drifted badly — it listed 2 of the 12
// configured sources and described the corpus as uniformly MIT, when three
// sources are Apache-2.0 and one is BSD-3-Clause.
//
// Hand-maintained tables drift. This pins the table to `sources.json` and the
// built corpus so it cannot, in the same spirit as `sync-theme-count:check`.

interface Source {
  id: string;
  name: string;
  url: string;
  license: string;
}

const root = new URL('..', import.meta.url);
const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf-8')) as Source[];
const themes = JSON.parse(readFileSync(new URL('data/themes.json', root), 'utf-8')) as {
  source: string;
}[];
const readme = readFileSync(new URL('README.md', root), 'utf-8');

/** The Attribution table's data rows, parsed back out of the README. */
function tableRows(): { id: string; count: number; license: string }[] {
  const section = readme.slice(readme.indexOf('## Attribution'), readme.indexOf('## License'));
  const rows: { id: string; count: number; license: string }[] = [];
  for (const line of section.split('\n')) {
    // | [Name](url) | `id` | count | share | license |
    const m =
      /^\|\s*\[[^\]]+\]\([^)]+\)\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|[^|]*\|\s*([^|]+?)\s*\|$/.exec(
        line,
      );
    if (m?.[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
      rows.push({ id: m[1], count: Number.parseInt(m[2], 10), license: m[3] });
    }
  }
  return rows;
}

const counts = new Map<string, number>();
for (const t of themes) counts.set(t.source, (counts.get(t.source) ?? 0) + 1);

describe('README attribution table matches sources.json', () => {
  it('lists every configured source, and no others', () => {
    expect(
      tableRows()
        .map((r) => r.id)
        .sort(),
    ).toEqual(sources.map((s) => s.id).sort());
  });

  it("states each source's license exactly as configured", () => {
    const configured = new Map(sources.map((s) => [s.id, s.license]));
    for (const row of tableRows()) {
      expect(row.license, `license for ${row.id}`).toBe(configured.get(row.id));
    }
  });

  it("states each source's real theme count", () => {
    for (const row of tableRows()) {
      expect(row.count, `theme count for ${row.id}`).toBe(counts.get(row.id) ?? 0);
    }
  });

  it('accounts for every theme in the corpus', () => {
    const listed = tableRows().reduce((a, r) => a + r.count, 0);
    expect(listed).toBe(themes.length);
  });

  it('does not claim the dataset is uniformly MIT', () => {
    // The specific error this file exists to prevent. If every source ever does
    // become MIT this test should be deleted deliberately, not silently passed.
    const nonMit = sources.filter((s) => s.license !== 'MIT');
    expect(nonMit.length).toBeGreaterThan(0);
    const section = readme.slice(readme.indexOf('## Attribution'), readme.indexOf('## License'));
    expect(section).toContain('Licenses are not uniform');
    for (const s of nonMit) {
      expect(section, `${s.id} (${s.license}) must appear`).toContain(s.license);
    }
  });
});
