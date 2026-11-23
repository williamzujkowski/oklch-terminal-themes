// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireDemoState } from '../src/lib/demo-state';

let dispose: (() => void) | undefined;
let signal: AbortController;

function form(pane: string): string {
  return `<form data-demo-form id="${pane}-form">
    <input data-demo-field="title" value="Palette review">
    <input data-demo-field="email" aria-describedby="${pane}-error" value="not-an-email">
    <span id="${pane}-error" data-demo-email-error>Enter a complete sample email.</span>
    <select data-demo-field="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>
    <input type="checkbox" data-demo-field="updates" checked>
    <button data-demo-submit type="submit" disabled>Run sample</button>
    <button data-demo-action="reset" type="button">Reset sample</button>
    <p data-demo-feedback>Sample only.</p>
  </form><button data-select-series="0">First series</button><button data-select-series="3">Fourth series</button>`;
}

beforeEach(() => {
  vi.useFakeTimers();
  signal = new AbortController();
  document.body.innerHTML = `<div id="workspace">${form('a')}${form('b')}<p data-theme-announcer role="status"></p></div><input id="outside" value="unchanged">`;
  dispose = wireDemoState(document, signal.signal);
});
afterEach(() => {
  dispose?.();
  signal.abort();
  vi.useRealTimers();
});

const field = (pane: string, name: string): HTMLInputElement =>
  document.querySelector(`#${pane}-form [data-demo-field="${name}"]`)!;
function input(pane: string, name: string, value: string): void {
  field(pane, name).value = value;
  field(pane, name).dispatchEvent(new Event('input', { bubbles: true }));
}
function submit(pane: string): Event {
  const event = new Event('submit', { bubbles: true, cancelable: true });
  document.querySelector(`#${pane}-form`)!.dispatchEvent(event);
  return event;
}
function feedback(pane: string): string {
  return document.querySelector(`#${pane}-form [data-demo-feedback]`)!.textContent ?? '';
}

describe('shared local form state', () => {
  it('synchronizes edits, selected controls and checkboxes without changing external fields', () => {
    input('a', 'title', 'Shared review');
    expect(field('b', 'title').value).toBe('Shared review');
    input('b', 'density', 'compact');
    expect(field('a', 'density').value).toBe('compact');
    field('a', 'updates').checked = false;
    field('a', 'updates').dispatchEvent(new Event('change', { bubbles: true }));
    expect(field('b', 'updates').checked).toBe(false);
    expect((document.querySelector('#outside') as HTMLInputElement).value).toBe('unchanged');
  });

  it('keeps effects inside an explicitly supplied workspace root', () => {
    dispose?.();
    document.body.insertAdjacentHTML('beforeend', form('outside'));
    dispose = wireDemoState(document.querySelector<HTMLElement>('#workspace')!, signal.signal);
    input('a', 'title', 'Inside only');
    expect(field('b', 'title').value).toBe('Inside only');
    expect(field('outside', 'title').value).toBe('Palette review');
  });

  it('prevents submission and exposes invalid state in both panes', () => {
    expect(submit('a').defaultPrevented).toBe(true);
    expect(field('a', 'email').getAttribute('aria-invalid')).toBe('true');
    expect(field('b', 'email').getAttribute('aria-invalid')).toBe('true');
    expect(feedback('a')).toMatch(/complete.*email/i);
    expect(feedback('b')).toBe(feedback('a'));
    vi.runAllTimers();
    expect(feedback('a')).not.toMatch(/complete\. no data/i);
  });

  it('runs one shared illustrative loading and success state without network effects', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    input('a', 'email', 'sample@example.com');
    expect(submit('b').defaultPrevented).toBe(true);
    expect(feedback('a')).toMatch(/progress/i);
    expect(feedback('b')).toBe(feedback('a'));
    expect(document.querySelector<HTMLButtonElement>('#a-form [data-demo-submit]')!.disabled).toBe(
      true,
    );
    expect(document.querySelector<HTMLButtonElement>('#b-form [data-demo-submit]')!.disabled).toBe(
      true,
    );
    vi.runAllTimers();
    expect(feedback('a')).toMatch(/complete.*no data/i);
    expect(feedback('b')).toBe(feedback('a'));
    expect(document.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(1);
    expect(document.querySelector('[data-theme-announcer]')!.textContent).toMatch(/complete/i);
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reset from either pane cancels pending completion and restores shared defaults', () => {
    input('a', 'email', 'sample@example.com');
    input('a', 'title', 'Changed title');
    submit('a');
    document.querySelector<HTMLButtonElement>('#b-form [data-demo-action="reset"]')!.click();
    vi.runAllTimers();
    expect(field('a', 'title').value).toBe('Palette review');
    expect(field('b', 'email').value).toBe('not-an-email');
    expect(feedback('a')).not.toMatch(/complete/i);
    expect(feedback('a')).toBe(feedback('b'));
  });

  it('aborting suppresses completion and removes delegated effects', () => {
    input('a', 'email', 'sample@example.com');
    submit('a');
    expect(feedback('a')).toMatch(/progress/i);
    signal.abort();
    const before = document.body.innerHTML;
    vi.runAllTimers();
    expect(document.body.innerHTML).toBe(before);
    input('a', 'title', 'After disposal');
    expect(field('b', 'title').value).toBe('Palette review');
  });

  it('bounds text values and rejects unsupported select values', () => {
    input('a', 'title', 'x'.repeat(500));
    expect(field('b', 'title').value.length).toBeLessThanOrEqual(80);
    input('a', 'density', 'unknown');
    expect(field('a', 'density').value).toBe('comfortable');
    expect(field('b', 'density').value).toBe('comfortable');
  });
  it('keeps a shared, bounded chart-series selection', () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-select-series="3"]');
    buttons[1]!.click();
    expect([...buttons].map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
    ]);
    const invalid = document.createElement('button');
    invalid.dataset.selectSeries = '999';
    document.body.append(invalid);
    invalid.click();
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
  });
});
