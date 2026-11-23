import { computeChartDiagnostics } from './chart-diagnostics';
import { formatRatio } from './formatters';
import type { ChartDiagnosticTheme, ChartOrigin, PairAudit } from './chart-diagnostics';

/** Shared illustrative specimen data; these are not repository telemetry. */
export const CHART_ACTIVITIES = [
  { label: 'Discovery', value: 32, marker: '○' },
  { label: 'Design', value: 46, marker: '□' },
  { label: 'Build', value: 68, marker: '◇' },
  { label: 'Test', value: 54, marker: '△' },
  { label: 'Review', value: 40, marker: '+' },
  { label: 'Release', value: 24, marker: '✳' },
] as const;
export const CHART_LINES = [
  { label: 'Plan A', values: [28, 44, 38, 66, 58, 72], marker: '○', dash: '' },
  { label: 'Plan B', values: [22, 32, 42, 54, 62, 68], marker: '□', dash: '6 4' },
] as const;
export const SEQUENTIAL_VALUES = [0, 10, 20, 30, 40, 50, 60] as const;
export const DIVERGING_VALUES = ['−3', '−2', '−1', '0 · baseline', '+1', '+2', '+3'] as const;

export function chartLinePoints(values: readonly number[]): string {
  return values.map((value, index) => `${24 + index * 48},${140 - value * 1.4}`).join(' ');
}
function originLabel(origin: ChartOrigin | undefined): string {
  if (origin === undefined) return 'Unavailable';
  if (origin.kind === 'copied')
    return `Source copy: ${origin.matchingSlots.join(' / ')}${origin.ambiguous ? ' (identical matches)' : ''}`;
  if (origin.kind === 'synthesized') return 'Synthesized categorical color';
  return origin.reason ?? 'Derived ramp step';
}
function pairLabel(audit: PairAudit): string {
  const pair = audit.minimum;
  return pair === null
    ? 'unavailable: at least two colors required'
    : `ΔE ≈ ${pair.deltaE.toFixed(4)} (colors ${pair.indices[0] + 1}/${pair.indices[1] + 1})`;
}
type Diagnostics = ReturnType<typeof computeChartDiagnostics>;
function chartCss(theme: ChartDiagnosticTheme): Record<string, string> {
  const css: Record<string, string> = {
    '--chart-background': theme.colors.background.oklchCss,
    '--chart-foreground': theme.colors.foreground.oklchCss,
  };
  const groups = {
    color: theme.dataviz?.categorical,
    sequential: theme.dataviz?.sequential,
    diverging: theme.dataviz?.diverging,
  };
  for (const [group, colors] of Object.entries(groups))
    colors?.forEach((color, i) => {
      css[`--chart-${group}-${i}`] = color.oklchCss;
    });
  return css;
}
function summaryLabel(diagnostics: Diagnostics): string {
  if (diagnostics.status !== 'available') return diagnostics.reason;
  const c = diagnostics.categorical;
  const minimum = c.background.minimum;
  const background = minimum
    ? `${formatRatio(minimum.ratio)} (color ${minimum.index + 1})`
    : 'unavailable';
  return `Canonical chart palette · sRGB. Ordinary ${pairLabel(c.ordinary)}; deuteranopia ${pairLabel(c.deficiencies.deuteranopia)}; protanopia ${pairLabel(c.deficiencies.protanopia)}; tritanopia ${pairLabel(c.deficiencies.tritanopia)}; background minimum ${background}. Severity 1, linear-light Machado simulation; ΔE 10 is a project heuristic, not certification.`;
}
function rampLabel(diagnostics: Diagnostics): string {
  if (diagnostics.status !== 'available') return '';
  const { sequential, diverging } = diagnostics;
  const midpoint =
    diverging.midpoint.status === 'available' ? diverging.midpoint.index + 1 : 'unavailable';
  return `Sequential OKLCH L: ${sequential.progression.direction}; ${sequential.progression.duplicateHexPairs.length} duplicate hex pairs. Diverging midpoint: ${midpoint}; left L ${diverging.leftArm?.direction ?? 'unavailable'}, right L ${diverging.rightArm?.direction ?? 'unavailable'}.`;
}
export function chartPresentation(theme: ChartDiagnosticTheme) {
  const diagnostics = computeChartDiagnostics(theme);
  const palette = Array.from({ length: 8 }, (_, index) => ({
    index,
    color: theme.dataviz?.categorical[index],
    origin: originLabel(
      diagnostics.status === 'available'
        ? diagnostics.categorical.entries[index]?.origin
        : undefined,
    ),
  }));
  return {
    diagnostics,
    css: chartCss(theme),
    palette,
    summary: summaryLabel(diagnostics),
    ramps: rampLabel(diagnostics),
  };
}
function setText(root: HTMLElement, selector: string, value: string): void {
  const node = root.querySelector<HTMLElement>(selector);
  if (node) node.textContent = value;
}
function paintPaletteEntry(
  row: HTMLElement,
  entry: ReturnType<typeof chartPresentation>['palette'][number] | undefined,
): void {
  const sample = row.querySelector<HTMLElement>('.viz-chip-swatch');
  if (entry?.color === undefined) {
    row.hidden = true;
    setText(row, '[data-value]', '');
    setText(row, '[data-chart-origin]', 'Unavailable');
    sample?.style.removeProperty('--viz-color');
    return;
  }
  row.hidden = false;
  setText(row, '[data-value]', entry.color.oklchCss);
  setText(row, '[data-chart-origin]', entry.origin);
  sample?.style.setProperty('--viz-color', entry.color.oklchCss);
}
function paintPalette(root: HTMLElement, model: ReturnType<typeof chartPresentation>): void {
  root.querySelectorAll<HTMLElement>('[data-chart-swatch]').forEach((row) => {
    paintPaletteEntry(row, model.palette[Number(row.dataset.chartSwatch)]);
  });
}
function paintRamps(root: HTMLElement, theme: ChartDiagnosticTheme): void {
  for (const group of ['sequential', 'diverging'] as const) {
    root.querySelectorAll<HTMLElement>(`[data-chart-${group}]`).forEach((step) => {
      const index = Number(
        step.dataset[group === 'sequential' ? 'chartSequential' : 'chartDiverging'],
      );
      const color = theme.dataviz?.[group][index];
      step.hidden = color === undefined;
      setText(
        step,
        '[data-chart-ramp-value]',
        color ? `L ${color.oklch.l} · C ${color.oklch.c}` : 'Unavailable',
      );
      setText(step, '[data-chart-ramp-css]', color?.oklchCss ?? '');
    });
  }
}
function paintSelection(root: HTMLElement, selectedSeries: number): void {
  const selected =
    Number.isInteger(selectedSeries) && selectedSeries >= 0 && selectedSeries < 6
      ? selectedSeries
      : 0;
  root.querySelectorAll<HTMLButtonElement>('[data-select-series]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.selectSeries) === selected));
  });
  root.querySelectorAll<HTMLElement>('[data-chart-bar]').forEach((bar) => {
    bar.dataset.selected = String(Number(bar.dataset.chartBar) === selected);
  });
  const activity = CHART_ACTIVITIES[selected]!;
  setText(
    root,
    '[data-chart-selected]',
    `Selected: ${activity.label} · ${activity.value} illustrative hours`,
  );
}

/** Pane-scoped painting; root owns shared selection events and asynchronous resolution. */
export function paintCharts(
  root: HTMLElement,
  theme: ChartDiagnosticTheme,
  selectedSeries = 0,
): void {
  const chart = root.matches('[data-chart-specimen]')
    ? root
    : root.querySelector<HTMLElement>('[data-chart-specimen]');
  if (!chart) return;
  const model = chartPresentation(theme);
  for (const group of ['color', 'sequential', 'diverging'])
    for (let i = 0; i < 8; i++) chart.style.removeProperty(`--chart-${group}-${i}`);
  for (const [name, value] of Object.entries(model.css)) chart.style.setProperty(name, value);
  chart.dataset.chartStatus = model.diagnostics.status;
  const content = chart.querySelector<HTMLElement>('[data-chart-content]');
  if (content) content.hidden = model.diagnostics.status !== 'available';
  setText(chart, '[data-chart-metrics]', model.summary);
  setText(chart, '[data-chart-ramp-metrics]', model.ramps);
  chart.querySelectorAll<HTMLElement>('[data-viz-bar]').forEach((bar, i) => {
    const color = theme.dataviz?.categorical[i];
    if (color) bar.style.setProperty('--viz-color', color.oklchCss);
    else bar.style.removeProperty('--viz-color');
  });
  paintPalette(chart, model);
  paintRamps(chart, theme);
  paintSelection(chart, selectedSeries);
}
