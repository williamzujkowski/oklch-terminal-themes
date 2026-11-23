// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPreviewPainter } from '../src/lib/theme-paint';
import type { SlimTheme } from '../src/lib/theme-store';

const theme = (slug: string, background: string): SlimTheme => ({
  name: slug,
  slug,
  isDark: true,
  colors: { background, foreground: 'oklch(0.9 0 0)' },
  contrast: { fgOnBg: 8, minAnsi: 2, minAnsiSlot: 'red' },
});
const a = (): HTMLElement => document.querySelector('[data-pane="a"]')!;
const b = (): HTMLElement => document.querySelector('[data-pane="b"]')!;
beforeEach(() => {
  const body =
    '<h2 data-theme-name>Previous</h2><p data-theme-meta></p><span data-wcag-badge hidden><b data-wcag-level></b><i data-wcag-ratio></i></span>';
  document.body.innerHTML = `<div class="showcase" data-pane="a">${body}</div><div class="showcase" data-pane="b">${body}</div><button class="combo-trigger"><span data-combo-label>Neutral picker</span></button>`;
});
describe('independent preview painting', () => {
  it('paints B without touching the reference or neutral picker', () => {
    createPreviewPainter(b())(theme('candidate', 'oklch(0.25 0.02 200)'));
    expect(b().querySelector('[data-theme-name]')?.textContent).toBe('candidate');
    expect(a().querySelector('[data-theme-name]')?.textContent).toBe('Previous');
    expect(a().style.getPropertyValue('--tt-background')).toBe('');
    expect(document.querySelector('[data-combo-label]')?.textContent).toBe('Neutral picker');
  });
  it('keeps the candidate intact when the reference changes repeatedly', () => {
    const paintA = createPreviewPainter(a());
    createPreviewPainter(b())(theme('candidate', 'oklch(0.25 0.02 200)'));
    paintA(theme('reference', 'oklch(0.2 0.03 285)'));
    paintA(theme('new-reference', 'oklch(0.3 0.01 100)'));
    expect(b().querySelector('[data-theme-name]')?.textContent).toBe('candidate');
    expect(b().style.getPropertyValue('--tt-background')).toBe('oklch(0.25 0.02 200)');
  });
  it('clears a previous contrast badge when a new record has no measurement', () => {
    const paint = createPreviewPainter(a());
    paint(theme('measured', 'oklch(0.2 0.03 285)'));
    paint({ name: 'Unavailable', slug: 'unavailable', isDark: true, colors: {} });
    expect(a().querySelector<HTMLElement>('[data-wcag-badge]')?.hidden).toBe(true);
  });
});
