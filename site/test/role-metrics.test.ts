// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import dracula from '@williamzujkowski/oklch-terminal-themes/themes/dracula.json';
import nord from '@williamzujkowski/oklch-terminal-themes/themes/nord.json';
import { normalBrightPairs, paintThemeSummary, summarizeTheme } from '../src/lib/theme-summary';

describe('canonical palette summaries', () => {
  it.each([
    [dracula, 13.3591, 3.026],
    [nord, 9.2452, 2.0673],
  ] as const)(
    'distinguishes strong body text from faint comments in %s',
    (theme, body, comment) => {
      const summary = summarizeTheme(theme);
      expect(summary.foregroundContrast).toBeCloseTo(body, 4);
      expect(summary.commentContrast).toBeCloseTo(comment, 4);
      expect(summary.commentContrast).toBeLessThan(4.5);
    },
  );

  it('names the six normal chromatic slots independently of the legacy all-20 mean', () => {
    const theme = structuredClone(dracula);
    for (const color of Object.values(theme.colors)) color.oklch.c = 0;
    for (const key of ['red', 'green', 'yellow', 'blue', 'purple', 'cyan'] as const)
      theme.colors[key].oklch.c = 0.1;
    theme.colors.cursor.oklch.c = 0.4;
    const summary = summarizeTheme(theme);
    expect(summary.meanAnsiChroma).toBeCloseTo(0.1, 12);
    expect(summary.meanAllChroma).toBeCloseTo(0.05, 12);
  });

  it('does not assign a red hue to a neutral background', () => {
    const theme = structuredClone(dracula);
    theme.colors.background.oklch.c = 0;
    theme.colors.background.oklch.h = 0;
    expect(summarizeTheme(theme).backgroundHue).toBeNull();
  });

  it('keeps all eight ordered ANSI pairs and reports signed differences neutrally', () => {
    const theme = structuredClone(nord);
    theme.colors.brightRed.oklch.l = theme.colors.red.oklch.l - 0.1;
    const pairs = normalBrightPairs(theme);
    expect(pairs).toHaveLength(8);
    expect(pairs[1]).toMatchObject({ normal: 'red', bright: 'brightRed' });
    expect(pairs[1]?.deltaL).toBeCloseTo(-0.1, 12);
  });

  it('paints only the supplied pane and keeps missing supplemental metrics unavailable', () => {
    const paneA = document.createElement('div');
    const paneB = document.createElement('div');
    paneA.innerHTML =
      '<span data-summary-fg></span><span data-summary-comment></span><span data-summary-apca></span>';
    paneB.textContent = 'Unchanged B';
    const theme = structuredClone(nord);
    delete theme.apca;
    paintThemeSummary(paneA, theme);
    expect(paneA.querySelector('[data-summary-fg]')?.textContent).toBe('9.2:1');
    expect(paneA.querySelector('[data-summary-comment]')?.textContent).toBe('2.0:1');
    expect(paneA.querySelector('[data-summary-apca]')?.textContent).toBe('Unavailable');
    expect(paneB.textContent).toBe('Unchanged B');
  });
});
