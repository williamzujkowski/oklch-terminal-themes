import { describe, expect, it } from 'vitest';
import { findColorFindings, withinColorLoss } from '../src/color-consistency.js';
import { convertHexToColor, convertOklchToColor } from '../src/convert.js';
import type { ColorValue } from '../src/types.js';

const native = convertOklchToColor({ l: 0.9, c: 0.005, h: 80 });
const check = (color: ColorValue, origin: 'hex' | 'authored' | 'derived' = 'authored') =>
  findColorFindings(color, origin, 'fixture.foreground');

describe('published color consistency', () => {
  it('rejects changing only the stored native fallback hex', () => {
    expect(check({ ...native, hex: '#000000' }).map((f) => f.path)).toContain(
      'fixture.foreground.hex',
    );
  });
  it.each(['oklch(0 0 0)', 'oklch(broken)', 'oklch(1 0 NaN)', 'oklch(2 0 0)'])(
    'rejects contradictory or malformed stored CSS %s',
    (oklchCss) => {
      expect(check({ ...native, oklchCss }).map((f) => f.path)).toContain(
        'fixture.foreground.oklchCss',
      );
    },
  );
  it('rejects a CSS value that is close but does not match the output precision', () => {
    expect(check({ ...native, oklchCss: 'oklch(0.90001 0.005 80)' }).map((f) => f.path)).toContain(
      'fixture.foreground.oklchCss',
    );
  });
  it('rejects a numeric component independently of the CSS and hex', () => {
    expect(
      check({ ...native, oklch: { ...native.oklch, l: Number.NaN } }).map((f) => f.path),
    ).toContain('fixture.foreground.oklch.l');
  });
  it('keeps native authored values whose gamut-mapped fallback is within the loss budget', () => {
    const value = convertOklchToColor({ l: 0.7, c: 0.16, h: 250 });
    const original = structuredClone(value);
    expect(check(value)).toEqual([]);
    expect(value).toEqual(original);
  });
  it.each(['#282a36', '#8be9fd', '#000000', '#ffffff'])(
    'accepts the actual published hex-authored forms for %s',
    (hex) => {
      expect(check(convertHexToColor(hex), 'hex')).toEqual([]);
    },
  );
  it('rejects independently corrupted hex-authored numeric OKLCH', () => {
    const value = convertHexToColor('#8be9fd');
    expect(check({ ...value, oklch: { l: 0, c: 0, h: 0 } }, 'hex').map((f) => f.path)).toContain(
      'fixture.foreground.oklch',
    );
  });
  it.each([0.999999999, 1, 1.000000001, Number.NaN, Number.POSITIVE_INFINITY])(
    'enforces strictly less than one for loss %s',
    (distance) => {
      expect(withinColorLoss(distance)).toBe(Number.isFinite(distance) && distance < 1);
    },
  );
});
