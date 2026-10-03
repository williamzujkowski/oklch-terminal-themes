// Renders the README's Attribution table from `sources.json` and the built
// corpus. Kept free of side effects (unlike the scripts that call it) so it
// can be unit-tested directly.
//
// The table was hand-maintained and pinned by `test/attribution.test.ts`,
// which is the right check but made every upstream sync that shifted a
// per-source count fail CI: the weekly update job ran red from 2026-08-17
// onward because nothing regenerated the counts. `sync-theme-count` now
// rewrites this block alongside the other managed counts.

export interface AttributionSource {
  id: string;
  name: string;
  url: string;
  license: string;
}

export const ATTRIBUTION_BLOCK_RE =
  /<!--\s*attribution-table\s*-->[\s\S]*?<!--\s*\/attribution-table\s*-->/g;

const HEADER = ['Upstream', '`source`', 'Themes', 'Share', 'License'];

function formatShare(count: number, total: number): string {
  return count === 0 ? '—' : `${((count / total) * 100).toFixed(1)}%`;
}

/** "`a`", "`a` and `b`", "`a`, `b` and `c`" — matching the README's prose style. */
function joinIds(ids: string[]): string {
  const quoted = ids.map((id) => `\`${id}\``);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1) ?? ''}`;
}

function emptySourceSentence(ids: string[]): string {
  const subject = joinIds(ids);
  return ids.length === 1
    ? `${subject} is configured but currently contributes 0 themes; it is kept so its attribution and license survive a future re-import.`
    : `${subject} are configured but currently contribute 0 themes; they are kept so their attribution and license survive a future re-import.`;
}

/** Left-aligned GFM table, padded the way prettier would format it. */
function renderTable(rows: string[][]): string {
  const widths = HEADER.map((h, col) =>
    Math.max(h.length, ...rows.map((r) => (r[col] ?? '').length)),
  );
  const line = (cells: string[]): string =>
    `| ${cells.map((c, col) => c.padEnd(widths[col] ?? 0)).join(' | ')} |`;
  return [line(HEADER), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export function renderAttributionBlock(
  sources: readonly AttributionSource[],
  counts: ReadonlyMap<string, number>,
): string {
  const total = sources.reduce((sum, s) => sum + (counts.get(s.id) ?? 0), 0);
  const ordered = [...sources].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name),
  );
  const rows = ordered.map((s) => {
    const count = counts.get(s.id) ?? 0;
    return [
      `[${s.name}](${s.url})`,
      `\`${s.id}\``,
      String(count),
      formatShare(count, total),
      s.license,
    ];
  });
  const empty = ordered.filter((s) => (counts.get(s.id) ?? 0) === 0).map((s) => s.id);
  const parts = ['<!-- attribution-table -->', renderTable(rows)];
  if (empty.length > 0) parts.push(emptySourceSentence(empty));
  parts.push('<!-- /attribution-table -->');
  return parts.join('\n\n');
}
