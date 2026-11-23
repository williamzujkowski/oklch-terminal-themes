import {
  converter,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
} from 'culori';
import type { Color } from 'culori';

export type CvdDeficiency = 'deuteranopia' | 'protanopia' | 'tritanopia';
const filters = {
  deuteranopia: filterDeficiencyDeuter(1),
  protanopia: filterDeficiencyProt(1),
  tritanopia: filterDeficiencyTrit(1),
};
const toLrgb = converter('lrgb');
const toRgb = converter('rgb');

/**
 * Existing Machado simulation, applied to LINEAR-LIGHT RGB (issue #197).
 * Culori's filter multiplies into rgb-labelled components, so hand it linear
 * values and reinterpret its result as linear before gamma-encoding to sRGB.
 * This reuses culori's matrices; it does not implement a new simulation.
 * Shared internally by the six-ANSI heuristic and site-owned chart diagnostics.
 */
export function simulateCvd(color: Color, deficiency: CvdDeficiency): Color {
  const lin = toLrgb(color);
  const out = filters[deficiency]({ mode: 'rgb', r: lin.r, g: lin.g, b: lin.b });
  return toRgb({ mode: 'lrgb', r: out.r, g: out.g, b: out.b });
}
