import { describe, it, expect } from 'vitest';
import themes from '../../data/themes.json';
import { createRoleMappings, formatRecipeCss } from '../src/lib/application-roles';

describe('explicit application mappings', () => {
  it('retains the original selected-text and comment assumptions', () => {
    const raw = createRoleMappings('raw');
    expect(raw.selection.slots).toEqual(['foreground', 'selection']);
    expect(raw.comment.foreground).toBe('var(--tt-bright-black)');
    expect(raw.dim.origin).toBe('derived');
    expect(raw.dim.transformation).toContain('55% alpha');
  });
  it('names changed UI roles without changing canonical palette values', () => {
    const theme = themes.find((theme) => theme.slug === 'nord')!;
    const before = JSON.stringify(theme.colors);
    const ui = createRoleMappings('ui-v1');
    expect(ui.comment.origin).toBe('derived');
    expect(ui.comment.transformation).toContain('65%');
    expect(ui.comment.slots).toEqual(['foreground', 'background']);
    expect(ui.selection.slots).toEqual(['foreground', 'blue', 'background']);
    expect(ui['code-surface'].background).toContain('color-mix');
    expect(JSON.stringify(theme.colors)).toBe(before);
  });
  it('exports the recipe, provenance and every source token independently', () => {
    const theme = themes.find((theme) => theme.slug === 'dracula')!;
    const css = formatRecipeCss(theme, 'ui-v1');
    expect(css).toContain(theme.upstreamSha);
    expect(css).toContain(theme.sourceUrl);
    expect(css).toContain('ui-v1');
    expect(css).toContain('--tt-bright-red:');
    expect(css).toContain('[data-role="comment"]');
    expect(css).toContain(createRoleMappings('ui-v1').comment.foreground);
  });
  it('keeps malicious theme labels inside the exported comment', () => {
    const theme = { ...themes[0]!, name: 'Example */ body { display:none } /*' };
    expect(formatRecipeCss(theme, 'raw')).toContain('Example *\\/');
  });
});
