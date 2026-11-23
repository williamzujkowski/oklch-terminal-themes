// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHART_ACTIVITIES,
  CHART_LINES,
  chartPresentation,
  paintCharts,
} from '../src/lib/chart-paint';
import type { TerminalColorTheme } from '../../src/types.js';

function theme(slug: string): TerminalColorTheme {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../data/by-name', `${slug}.json`), 'utf8'),
  ) as TerminalColorTheme;
}
function fixture(): HTMLElement {
  const root = document.createElement('section');
  root.dataset.chartSpecimen = '';
  root.innerHTML = `<p data-chart-metrics></p><p data-chart-ramp-metrics></p><p data-chart-selected></p><div data-chart-content>
    ${CHART_ACTIVITIES.map((row, i) => `<button data-select-series="${i}" aria-pressed="false">${row.label}</button><span data-viz-bar data-chart-bar="${i}" data-value="${row.value}"></span>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<li data-chart-swatch="${i}"><button class="viz-chip" data-viz-swatch="${i}"><span class="viz-chip-swatch" data-role="chart-series" data-chart-index="${i}">████</span><code data-value></code></button><span data-chart-origin></span></li>`).join('')}
    ${['sequential', 'diverging'].flatMap((group) => Array.from({ length: 7 }, (_, i) => `<div data-chart-${group}="${i}"><span data-chart-ramp-value></span><code data-chart-ramp-css></code></div>`)).join('')}</div>`;
  document.body.append(root);
  return root;
}
afterEach(() => {
  document.body.replaceChildren();
});

describe('scoped authentic chart painting', () => {
  it('matches the server presentation model while preserving source CSS', () => {
    const root = fixture(),
      source = theme('github'),
      model = chartPresentation(source);
    root.style.setProperty('--role-body-fg', '#fa00fa');
    paintCharts(root, source);
    for (const [name, css] of Object.entries(model.css))
      expect(root.style.getPropertyValue(name)).toBe(css);
    expect(root.style.getPropertyValue('--chart-color-0')).toBe(
      source.dataviz!.categorical[0]!.oklchCss,
    );
    expect(root.querySelector('[data-chart-metrics]')!.textContent).toContain(
      'Canonical chart palette · sRGB',
    );
    expect(root.querySelector('[data-chart-metrics]')!.textContent).toContain('3.7279');
    expect(root.querySelector('[data-chart-metrics]')!.textContent).toContain('background minimum');
  });
  it('updates only the intended pane and keeps shared specimen data unchanged', () => {
    const a = fixture(),
      b = fixture();
    paintCharts(a, theme('dracula'), 3);
    paintCharts(b, theme('nord'), 3);
    const untouched = b.outerHTML,
      values = [...a.querySelectorAll('[data-chart-bar]')].map((row) =>
        row.getAttribute('data-value'),
      );
    paintCharts(a, theme('nord-light'), 3);
    expect(b.outerHTML).toBe(untouched);
    expect(
      [...a.querySelectorAll('[data-chart-bar]')].map((row) => row.getAttribute('data-value')),
    ).toEqual(values);
    expect(CHART_LINES.map((line) => line.label)).toEqual(['Plan A', 'Plan B']);
    expect(a.querySelector('[data-select-series="3"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(a.querySelector('[data-chart-selected]')!.textContent).toBe(
      'Selected: Test · 54 illustrative hours',
    );
  });
  it('shows every actual palette entry, origins, and seven real values for both ramps', () => {
    const root = fixture(),
      source = theme('github');
    paintCharts(root, source);
    expect(
      [...root.querySelectorAll<HTMLElement>('[data-chart-swatch]')].filter((row) => !row.hidden),
    ).toHaveLength(source.dataviz!.categorical.length);
    expect(
      root.querySelector('[data-chart-swatch="0"] [data-chart-origin]')!.textContent,
    ).toContain('Source copy:');
    for (const group of ['sequential', 'diverging'] as const)
      source.dataviz![group].forEach((color, i) => {
        expect(root.style.getPropertyValue(`--chart-${group}-${i}`)).toBe(color.oklchCss);
        expect(
          root.querySelector(`[data-chart-${group}="${i}"] [data-chart-ramp-css]`)!.textContent,
        ).toBe(color.oklchCss);
      });
    expect(root.querySelector('[data-chart-ramp-metrics]')!.textContent).toContain('midpoint: 4');
  });
  it('does not describe synthesized colors as source-slot copies', () => {
    const root = fixture(),
      source = theme('hercules-graphics');
    paintCharts(root, source);
    const count = source.dataviz!.categoricalSynthesized!;
    expect(
      [...root.querySelectorAll('[data-chart-origin]')].filter((row) =>
        row.textContent!.includes('Synthesized'),
      ),
    ).toHaveLength(count);
  });
  it('clears unavailable chart data instead of retaining prior colors or claims', () => {
    const root = fixture();
    paintCharts(root, theme('github'));
    const absent = theme('dracula');
    delete absent.dataviz;
    paintCharts(root, absent);
    expect(root.dataset.chartStatus).toBe('unavailable');
    expect(root.querySelector<HTMLElement>('[data-chart-content]')!.hidden).toBe(true);
    expect(root.style.getPropertyValue('--chart-color-0')).toBe('');
    expect(root.querySelector('[data-chart-metrics]')!.textContent).toContain('No generated');
    expect(root.querySelector('[data-chart-ramp-metrics]')!.textContent).toBe('');
  });
});
