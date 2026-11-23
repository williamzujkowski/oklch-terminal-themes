import { measureRole, ROLE_LABELS, INSPECTOR_ROLES, type RoleMeasurement } from './role-metrics';
import { normalBrightPairs, summarizeTheme } from './theme-summary';
import type { ThemeDetailsRecord } from './theme-details';
import type { Recipe } from './application-roles';

export { INSPECTOR_ROLES };

export interface InspectorPane {
  id: 'a' | 'b';
  root: HTMLElement;
  theme: ThemeDetailsRecord | undefined;
  phase: 'loading' | 'ready' | 'error';
}
export interface InspectorOptions {
  role: string | null;
  recipe: Recipe;
  view: string;
  size: string | number;
  panes: readonly InspectorPane[];
  isCurrent?: () => boolean;
}
const generations = new WeakMap<HTMLElement, number>();
const highlights = new WeakMap<HTMLElement, HTMLElement[]>();

function node(doc: Document, tag: string, text = ''): HTMLElement {
  const result = doc.createElement(tag);
  result.textContent = text;
  return result;
}
function line(parent: HTMLElement, label: string, value: string): void {
  const row = node(parent.ownerDocument, 'p');
  row.append(node(parent.ownerDocument, 'strong', `${label}: `), value);
  parent.append(row);
}
function sourceDescription(card: HTMLElement, measurement: RoleMeasurement): void {
  const { mapping, canonical, reason } = measurement.description;
  if (mapping) {
    line(card, 'Application mapping', `${mapping.origin} · ${mapping.slots.join(' / ')}`);
    line(card, 'CSS inputs', `${mapping.foreground} / ${mapping.background}`);
    line(card, 'Transformation', mapping.transformation);
  }
  if (canonical) {
    line(card, canonical.label, `${canonical.foreground} / ${canonical.background}`);
    line(card, 'Canonical OKLCH', `${canonical.foregroundOklch} / ${canonical.backgroundOklch}`);
    line(card, 'Canonical reference contrast', `${canonical.ratio.toFixed(6)}:1`);
  }
  if (reason) line(card, 'Source limitation', reason);
}
function resolvedDescription(card: HTMLElement, measurement: RoleMeasurement, role: string): void {
  const result = measurement.resolved;
  line(card, 'Scope', result.scope);
  if (result.status === 'unavailable') {
    line(card, 'Resolved result', `Unavailable · ${result.reason}`);
    return;
  }
  line(card, 'Method', result.method);
  if (['cursor-surface', 'primary-surface', 'border', 'focus', 'chart-series'].includes(role))
    line(card, 'Property measurement', `${role} property versus its actual backing`);
  for (const [label, color] of Object.entries(measurement.effective ?? {})) {
    line(
      card,
      `Sampled ${label}`,
      `${color.hex} · approximate ${color.oklch ?? 'OKLCH unavailable'}`,
    );
  }
  const contrast = result.contrast;
  line(card, 'Resolved contrast', `${contrast.ratio.toFixed(6)}:1 · ${contrast.assessment}`);
  line(
    card,
    'Conservative bounds',
    `${contrast.minimum.toFixed(6)}–${contrast.maximum.toFixed(6)}:1`,
  );
  line(
    card,
    'Required threshold',
    `${contrast.threshold}:1 · actual computed font or non-text role`,
  );
  line(card, 'Computed foreground', result.inputs.foregroundCss);
  line(
    card,
    'Backing chain',
    result.inputs.backgroundLayers.map((layer) => `${layer.element}: ${layer.css}`).join(' → '),
  );
  line(card, 'Limitations', result.limitations.join(' '));
}
function paletteDetails(card: HTMLElement, theme: ThemeDetailsRecord): void {
  const doc = card.ownerDocument;
  const details = node(doc, 'details');
  details.append(node(doc, 'summary', 'Canonical ANSI progression and supplemental metrics'));
  const summary = summarizeTheme(theme);
  line(details, 'Legacy all-20 mean C', summary.meanAllChroma.toFixed(4));
  line(details, 'Six normal chromatic mean C', summary.meanAnsiChroma.toFixed(4));
  line(
    details,
    'Background hue',
    summary.backgroundHue === null
      ? 'Unavailable (neutral)'
      : `${summary.backgroundHue.toFixed(1)}°`,
  );
  line(
    details,
    'APCA',
    summary.apca
      ? `Canonical fg/bg, signed Lc ${summary.apca.fgOnBg >= 0 ? '+' : ''}${summary.apca.fgOnBg.toFixed(2)}; separate from WCAG`
      : 'Unavailable',
  );
  line(
    details,
    'CVD scope',
    'Canonical six normal chromatic slots: red, green, yellow, blue, purple, cyan; linear-sRGB Machado severity 1, protan/deutan/tritan. Excludes neutral, bright and UI-derived roles. Supplemental data, not a universal accessibility certificate.',
  );
  line(
    details,
    'Canonical CVD scores',
    summary.cvd
      ? `deutan ${summary.cvd.deuteranopia}; protan ${summary.cvd.protanopia}; tritan ${summary.cvd.tritanopia}`
      : 'Unavailable',
  );
  line(
    details,
    'ANSI minimum exclusions',
    theme.isDark ? 'black and brightBlack on dark themes' : 'white and brightWhite on light themes',
  );
  appendProgression(details, theme);
  card.append(details);
}
function appendProgression(details: HTMLElement, theme: ThemeDetailsRecord): void {
  const doc = details.ownerDocument;
  const table = node(doc, 'table');
  table.append(
    node(
      doc,
      'caption',
      'Normal → bright; signed OKLCH ΔL / ΔC; canonical sRGB contrast versus background',
    ),
  );
  for (const pair of normalBrightPairs(theme)) {
    const row = node(doc, 'tr');
    row.append(node(doc, 'th', `${pair.normal} → ${pair.bright}`));
    row.append(node(doc, 'td', `${pair.deltaL.toFixed(4)} / ${pair.deltaC.toFixed(4)}`));
    row.append(
      node(doc, 'td', `${pair.normalContrast.toFixed(4)} / ${pair.brightContrast.toFixed(4)}:1`),
    );
    table.append(row);
  }
  details.append(table);
}
async function paneCard(doc: Document, pane: InspectorPane, options: InspectorOptions) {
  const card = node(doc, 'article');
  card.dataset.inspectorPane = pane.id;
  card.append(node(doc, 'h3', `${pane.id.toUpperCase()} · ${pane.theme?.name ?? 'Theme details'}`));
  if (pane.phase !== 'ready' || !pane.theme) {
    line(
      card,
      'Details',
      pane.phase === 'loading'
        ? 'Loading full canonical record…'
        : 'Unavailable; retry theme details to inspect this pane.',
    );
    return { card, element: null };
  }
  const measurement = await measureRole(
    pane.root,
    pane.theme,
    options.role!,
    options.recipe,
    options.view,
  );
  sourceDescription(card, measurement);
  resolvedDescription(card, measurement, options.role!);
  paletteDetails(card, pane.theme);
  return { card, element: measurement.element };
}
function fingerprint(root: HTMLElement): string {
  return `${root.getAttribute('style')}|${root.getAttribute('data-theme')}|${root.getAttribute('data-theme-slug')}`;
}

function paintControls(container: HTMLElement, options: InspectorOptions): void {
  const role = options.role!;
  const select = container.querySelector<HTMLSelectElement>('[data-inspected-role]');
  if (select) select.value = role!;
  const title = container.querySelector('[data-inspector-title]');
  if (title)
    title.textContent = `${ROLE_LABELS[role!] ?? role} · ${options.recipe} · ${options.size}px`;
}

/** Controls/URL wiring belongs to the application; this paints one shared inspector. */
export async function paintRoleInspector(
  container: HTMLElement,
  options: InspectorOptions,
): Promise<void> {
  const generation = (generations.get(container) ?? 0) + 1;
  generations.set(container, generation);
  for (const element of highlights.get(container) ?? [])
    element.removeAttribute('data-inspected-role-target');
  highlights.set(container, []);
  const role = options.role;
  container.hidden = role === null || !INSPECTOR_ROLES.includes(role);
  if (container.hidden) return;
  paintControls(container, options);
  const snapshots = options.panes.map((pane) => fingerprint(pane.root));
  const cards = await Promise.all(
    options.panes.map((pane) => paneCard(container.ownerDocument, pane, options)),
  );
  if (outdated(container, generation, options, snapshots)) return;
  const results = container.querySelector('[data-inspector-results]');
  results?.replaceChildren(...cards.map(({ card }) => card));
  const targets =
    options.role === 'focus' ? [] : cards.flatMap(({ element }) => (element ? [element] : []));
  for (const element of targets) element.setAttribute('data-inspected-role-target', '');
  highlights.set(container, targets);
}

function outdated(
  container: HTMLElement,
  generation: number,
  options: InspectorOptions,
  snapshots: string[],
): boolean {
  return (
    options.isCurrent?.() === false ||
    generations.get(container) !== generation ||
    options.panes.some((pane, index) => fingerprint(pane.root) !== snapshots[index])
  );
}
