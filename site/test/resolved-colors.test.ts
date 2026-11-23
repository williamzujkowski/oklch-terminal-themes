// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRoleContrast } from '../src/lib/resolved-colors';
import { sampledContrast } from '../src/lib/contrast-sample';
import { wcagContrast } from '../../src/classify';

describe('sampled CSS contrast bounds', () => {
  it('retains the independent black/white ratio and bounds its sample error', () => {
    const result = sampledContrast([0, 0, 0], [255, 255, 255]);
    expect(result.ratio).toBe(21);
    expect(result.minimum).toBeGreaterThan(20);
    expect(result.maximum).toBe(21);
    expect(result.assessment).toBe('pass');
  });

  it('matches the package WCAG function for all 8-bit gray channels', () => {
    for (let channel = 0; channel <= 255; channel++) {
      const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
      expect(sampledContrast([channel, channel, channel], [255, 255, 255]).ratio).toBeCloseTo(
        wcagContrast(hex, '#ffffff'),
        12,
      );
    }
  });

  it('does not promote a just-failing teal pair across ordinary-text AA', () => {
    const result = sampledContrast([0, 133, 128], [255, 255, 255]);
    expect(result.ratio).toBeCloseTo(4.49995427140476, 10);
    expect(result.minimum).toBeLessThan(4.5);
    expect(result.maximum).toBeGreaterThan(4.5);
    expect(result.assessment).toBe('indeterminate');
  });

  it('fails a clearly weak pair and is symmetric when foreground swaps', () => {
    const result = sampledContrast([160, 160, 160], [255, 255, 255]);
    expect(result.assessment).toBe('fail');
    expect(result.maximum).toBeLessThan(3);
    const reversed = sampledContrast([255, 255, 255], [160, 160, 160]);
    expect(reversed).toMatchObject({
      ratio: result.ratio,
      minimum: result.minimum,
      maximum: result.maximum,
    });
  });

  it('covers overlapping luminance intervals conservatively', () => {
    const result = sampledContrast([127, 127, 127], [128, 128, 128]);
    expect(result.minimum).toBe(1);
    expect(result.maximum).toBeGreaterThan(result.ratio);
  });

  it('does not invent contrast for invalid channels or thresholds', () => {
    expect(() => sampledContrast([NaN, 0, 0], [0, 0, 0])).toThrow(RangeError);
    expect(() => sampledContrast([0, 0, 0], [256, 0, 0])).toThrow(RangeError);
    expect(() => sampledContrast([0, 0, 0], [0, 0, 0], 0)).toThrow(RangeError);
    expect(() => sampledContrast([0, 0, 0], [0, 0, 0], 4.5, -1)).toThrow(RangeError);
  });
});

describe('resolved CSS diagnostics', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function role(styles = 'color: black; background: white'): HTMLElement {
    const element = document.createElement('span');
    element.style.cssText = styles;
    document.body.appendChild(element);
    return element;
  }

  it('reports missing canvas support instead of falling back to source values', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(resolveRoleContrast(role())).toMatchObject({
      status: 'unavailable',
      scope: 'Preview · resolved CSS in sRGB',
      reason: 'An sRGB canvas context is unavailable',
    });
  });

  it('does not guess a white background for an undeclared backing surface', () => {
    expect(resolveRoleContrast(role('color:black'))).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('No opaque declared backing'),
    });
  });

  it.each([
    ['opacity:.5', 'Group opacity'],
    ['filter:blur(1px)', 'filter'],
    ['mix-blend-mode:multiply', 'mix-blend-mode'],
    ['background:linear-gradient(white, black)', 'Background images/gradients'],
  ])('rejects unsupported rendered effects: %s', (effect, reason) => {
    expect(resolveRoleContrast(role(`color:black; background:white; ${effect}`))).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining(reason),
    });
  });

  it('rejects group effects above an opaque preview surface', () => {
    const element = role();
    document.body.style.opacity = '.5';
    expect(resolveRoleContrast(element)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('Group opacity'),
    });
    document.body.style.removeProperty('opacity');
  });

  it('reports detached roles explicitly', () => {
    expect(resolveRoleContrast(document.createElement('span'))).toMatchObject({
      status: 'unavailable',
      reason: 'Role is detached from its document',
    });
  });

  it('does not claim sRGB when the canvas context cannot verify it', () => {
    const context = { getContextAttributes: () => ({ colorSpace: 'display-p3' }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    expect(resolveRoleContrast(role())).toMatchObject({
      status: 'unavailable',
      reason: 'Canvas sRGB color space could not be verified',
    });
  });

  it('detects an unsupported canvas color assignment retaining its old fill', () => {
    let fill = '#000000';
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getContextAttributes: () => ({ colorSpace: 'srgb' }),
      getImageData: () => ({
        colorSpace: 'srgb',
        data: new Uint8ClampedArray([255, 255, 255, 255]),
      }),
      get fillStyle() {
        return fill;
      },
      set fillStyle(value: string) {
        if (!value.startsWith('oklch')) fill = value;
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    expect(resolveRoleContrast(role('color:oklch(.5 .1 30);background:white'))).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('Canvas does not support color: oklch'),
    });
  });
});
