// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nord from '@williamzujkowski/oklch-terminal-themes/themes/nord.json';
import { findRoleElement, measureRole } from '../src/lib/role-metrics';
import { resolveRoleContrast } from '../src/lib/resolved-colors';

vi.mock('../src/lib/resolved-colors', () => ({ resolveRoleContrast: vi.fn() }));

function specimen(markup: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = markup;
  document.body.append(root);
  return root;
}

beforeEach(() => {
  vi.mocked(resolveRoleContrast).mockReturnValue({
    status: 'unavailable',
    scope: 'Preview · resolved CSS in sRGB',
    reason: 'Captured test input',
  });
});
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('actual chart property measurement', () => {
  it('uses the displayed series color, its own backing, and a non-text threshold', async () => {
    const root = specimen(`<section data-specimen="dataviz" style="background:white">
      <span data-role="chart-series" data-series-index="0" style="color:rgb(240, 30, 50);background-color:rgb(10, 20, 30)">████</span>
    </section>`);
    let sampledColor: string | undefined;
    let backing: string | undefined;
    vi.mocked(resolveRoleContrast).mockImplementation((probe) => {
      sampledColor = getComputedStyle(probe).color;
      backing = getComputedStyle(probe.parentElement!).backgroundColor;
      return {
        status: 'unavailable',
        scope: 'Preview · resolved CSS in sRGB',
        reason: 'Captured test input',
      };
    });
    const before = root.innerHTML;
    const result = await measureRole(root, nord, 'chart-series', 'ui-v1', 'dataviz');
    expect(sampledColor).toBe('rgb(240, 30, 50)');
    expect(backing).toBe('rgb(10, 20, 30)');
    expect(resolveRoleContrast).toHaveBeenCalledWith(expect.any(HTMLElement), 3);
    expect(result.description.canonical?.foreground).toBe(nord.dataviz!.categorical[0]!.hex);
    expect(root.innerHTML).toBe(before);
  });
  it('follows the shared selected series for both the sampled element and canonical origin', async () => {
    const root = specimen(`<section data-specimen="dataviz">
      <button data-select-series="0" aria-pressed="false">One</button>
      <button data-select-series="1" aria-pressed="true">Two</button>
      <span id="first" data-role="chart-series" data-series-index="0" style="color:red;background:black">████</span>
      <span id="second" data-role="chart-series" data-series-index="1" style="color:lime;background:black">████</span>
    </section>`);
    const result = await measureRole(root, nord, 'chart-series', 'raw', 'dataviz');
    expect(result.element?.id).toBe('second');
    expect(result.description.mapping?.slots).toEqual(['categorical[1]', 'background']);
    expect(result.description.canonical?.foreground).toBe(nord.dataviz!.categorical[1]!.hex);
    const probe = vi.mocked(resolveRoleContrast).mock.calls[0]![0];
    expect(probe.style.color).toBe('rgb(0, 255, 0)');
    expect(root.querySelectorAll('[data-role="chart-series"]')).toHaveLength(2);
  });
});

describe('actual keyboard focus lookup', () => {
  it('measures the focused input ring instead of an unfocused role-labeled reset button', async () => {
    const root = specimen(`<section data-specimen="dashboard">
      <input id="title" data-role="body" style="outline:2px solid rgb(25, 90, 240)" />
      <button data-role="focus" style="outline:none">Reset</button>
    </section>`);
    const input = root.querySelector<HTMLInputElement>('input')!;
    input.focus();
    expect(input.matches(':focus-visible')).toBe(true);
    expect(findRoleElement(root, 'focus', 'dashboard')).toBe(input);
    const result = await measureRole(root, nord, 'focus', 'raw', 'dashboard');
    expect(result.element).toBe(input);
    expect(resolveRoleContrast).toHaveBeenCalledWith(expect.any(HTMLElement), 3);
    expect(vi.mocked(resolveRoleContrast).mock.calls[0]![0].style.color).toBe('rgb(25, 90, 240)');
  });
  it('never borrows a focus ring from another pane, specimen, or hidden scenario', () => {
    const focusedPane = specimen('<section data-specimen="dashboard"><input /></section>');
    const otherPane = specimen('<section data-specimen="dashboard"><input /></section>');
    const input = focusedPane.querySelector<HTMLInputElement>('input')!;
    input.focus();
    expect(findRoleElement(otherPane, 'focus', 'dashboard')).toBeNull();
    expect(findRoleElement(focusedPane, 'focus', 'terminal')).toBeNull();
    input.parentElement!.hidden = true;
    expect(findRoleElement(focusedPane, 'focus', 'dashboard')).toBeNull();
  });
  it('keeps absent ring states unavailable rather than returning a text contrast', async () => {
    const root = specimen(
      '<section data-specimen="dashboard"><input style="outline:none" /></section>',
    );
    root.querySelector<HTMLInputElement>('input')!.focus();
    const result = await measureRole(root, nord, 'focus', 'raw', 'dashboard');
    expect(result.resolved).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('No declared visible'),
    });
    expect(resolveRoleContrast).not.toHaveBeenCalled();
  });
});
