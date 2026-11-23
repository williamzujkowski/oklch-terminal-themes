import { sampledContrast, type SampleContrast, type SrgbSample } from './contrast-sample.js';

const SCOPE = 'Preview · resolved CSS in sRGB';

interface BackingLayer {
  element: string;
  css: string;
}

export type ResolvedContrast =
  | {
      status: 'available';
      scope: typeof SCOPE;
      method: 'sRGB canvas · 8-bit sampled approximation';
      inputs: { foregroundCss: string; backgroundLayers: BackingLayer[] };
      foreground: SrgbSample;
      background: SrgbSample;
      contrast: SampleContrast;
      limitations: string[];
    }
  | { status: 'unavailable'; scope: typeof SCOPE; reason: string };

interface StyledAncestor extends BackingLayer {
  image: string;
}

function isEffect(value: string, normal: string): boolean {
  return value !== '' && value !== normal;
}

function rejectGroupEffects(style: CSSStyleDeclaration): void {
  if (Number(style.opacity || '1') !== 1) throw new Error('Group opacity is unsupported');
  for (const key of ['filter', 'backdrop-filter']) {
    if (isEffect(style.getPropertyValue(key), 'none')) throw new Error(`${key} is unsupported`);
  }
  for (const key of ['mix-blend-mode', 'background-blend-mode']) {
    const modes = style
      .getPropertyValue(key)
      .split(',')
      .map((value) => value.trim());
    if (modes.some((value) => isEffect(value, 'normal'))) {
      throw new Error(`${key} is unsupported`);
    }
  }
}

function ancestors(element: HTMLElement): StyledAncestor[] {
  const win = element.ownerDocument.defaultView;
  if (!win || !element.isConnected) throw new Error('Role is detached from its document');
  const layers: StyledAncestor[] = [];
  let node: Element | null = element;
  while (node) {
    const style = win.getComputedStyle(node);
    rejectGroupEffects(style);
    layers.push({
      element: node.id ? `${node.localName}#${node.id}` : node.localName,
      css: style.backgroundColor,
      image: style.backgroundImage,
    });
    node = node.parentElement;
  }
  return layers;
}

/** Computed CSS serializes alpha explicitly when it is not opaque. */
function opaque(css: string): boolean {
  if (css === '' || css === 'transparent') return false;
  const slash = css.lastIndexOf('/');
  if (slash !== -1) {
    const alpha = css
      .slice(slash + 1)
      .replace(/\)\s*$/, '')
      .trim();
    return alpha.endsWith('%') ? Number.parseFloat(alpha) === 100 : Number(alpha) === 1;
  }
  if (css.startsWith('rgba(')) return Number(css.slice(css.lastIndexOf(',') + 1, -1)) === 1;
  return true;
}

function backgroundLayers(layers: StyledAncestor[]): BackingLayer[] {
  const result: BackingLayer[] = [];
  for (const layer of layers) {
    if (isEffect(layer.image, 'none'))
      throw new Error('Background images/gradients are unsupported');
    result.push({ element: layer.element, css: layer.css });
    if (opaque(layer.css)) return result.reverse();
  }
  throw new Error('No opaque declared backing surface; browser canvas defaults are not assumed');
}

function createContext(doc: Document): CanvasRenderingContext2D {
  const canvas = doc.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!context || typeof context.getContextAttributes !== 'function') {
    throw new Error('An sRGB canvas context is unavailable');
  }
  if (context.getContextAttributes().colorSpace !== 'srgb') {
    throw new Error('Canvas sRGB color space could not be verified');
  }
  return context;
}

/** Invalid fillStyle assignments retain the previous value: test two sentinels. */
function paint(context: CanvasRenderingContext2D, css: string): void {
  if (css.toLowerCase().includes('currentcolor') || css.includes('var(')) {
    throw new Error('Unresolved contextual CSS color is unsupported');
  }
  context.fillStyle = '#010203';
  context.fillStyle = css;
  const first = context.fillStyle;
  context.fillStyle = '#fdfcfb';
  context.fillStyle = css;
  if (context.fillStyle !== first) throw new Error(`Canvas does not support color: ${css}`);
  context.fillRect(0, 0, 1, 1);
}

function sample(context: CanvasRenderingContext2D): SrgbSample {
  const image = context.getImageData(0, 0, 1, 1, {
    colorSpace: 'srgb',
    pixelFormat: 'rgba-unorm8',
  });
  if (image.colorSpace !== 'srgb' || !(image.data instanceof Uint8ClampedArray)) {
    throw new Error('Canvas did not return verified 8-bit sRGB samples');
  }
  const [red, green, blue, alpha] = image.data;
  if (red === undefined || green === undefined || blue === undefined || alpha !== 255) {
    throw new Error('Canvas swatch has no opaque resolved backing');
  }
  return [red, green, blue];
}

function measure(
  element: HTMLElement,
  layers: BackingLayer[],
  threshold: number,
): ResolvedContrast {
  const context = createContext(element.ownerDocument);
  context.clearRect(0, 0, 1, 1);
  for (const layer of layers) paint(context, layer.css);
  const background = sample(context);
  const foregroundCss = element.ownerDocument.defaultView!.getComputedStyle(element).color;
  paint(context, foregroundCss);
  const foreground = sample(context);
  return {
    status: 'available',
    scope: SCOPE,
    method: 'sRGB canvas · 8-bit sampled approximation',
    inputs: { foregroundCss, backgroundLayers: layers },
    foreground,
    background,
    // Each conversion/source-over paint can quantize. One full channel unit
    // per paint conservatively exceeds half-unit nearest-rounding loss.
    contrast: sampledContrast(foreground, background, threshold, layers.length + 1),
    limitations: [
      'CSS swatches, not antialiased text pixels or physical display/HDR measurements.',
      'Sampled 8-bit approximation; a quantization interval crossing the threshold is indeterminate.',
    ],
  };
}

/** Resolve the actual element and solid ancestor backings; never substitute source-hex metadata. */
export function resolveRoleContrast(element: HTMLElement, threshold = 4.5): ResolvedContrast {
  try {
    return measure(element, backgroundLayers(ancestors(element)), threshold);
  } catch (error) {
    return {
      status: 'unavailable',
      scope: SCOPE,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
