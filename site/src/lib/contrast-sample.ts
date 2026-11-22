/** Opaque, sampled sRGB channels in the inclusive 0–255 range. */
export type SrgbSample = readonly [number, number, number];

export interface SampleContrast {
  ratio: number;
  minimum: number;
  maximum: number;
  threshold: number;
  assessment: 'pass' | 'fail' | 'indeterminate';
  /** Conservative uncertainty per channel, in 8-bit sample units. */
  channelError: number;
}

function validateSample(sample: SrgbSample): void {
  if (sample.length !== 3 || sample.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
    throw new RangeError('sRGB samples need three finite channels between 0 and 255');
  }
}

// WCAG relative luminance, applied to intervals as well as their sample centers.
// Source: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
// This small continuous-channel primitive avoids importing the package barrel
// (culori/APCA/Zod) into the client; canonical 8-bit parity is tested separately.
function luminance(sample: SrgbSample, offset = 0): number {
  const linear = sample.map((channel) => {
    const value = Math.max(0, Math.min(255, channel + offset)) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function validateOptions(threshold: number, channelError: number): void {
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 21) {
    throw new RangeError('Contrast threshold must be between 1 and 21');
  }
  if (!Number.isFinite(channelError) || channelError < 0) {
    throw new RangeError('Channel uncertainty must be finite and nonnegative');
  }
}

/**
 * Bounds the contrast of CSS swatch samples, not antialiased text pixels.
 * An 8-bit canvas can round each painting operation; callers pass a conservative
 * accumulated channel error. An interval straddling the requested threshold is
 * indeterminate, never a pass obtained by rounding the central ratio upward.
 */
export function sampledContrast(
  foreground: SrgbSample,
  background: SrgbSample,
  threshold = 4.5,
  channelError = 1,
): SampleContrast {
  validateSample(foreground);
  validateSample(background);
  validateOptions(threshold, channelError);
  const fg = [luminance(foreground, -channelError), luminance(foreground, channelError)];
  const bg = [luminance(background, -channelError), luminance(background, channelError)];
  const low = Math.max(fg[0]!, bg[0]!);
  const high = Math.min(fg[1]!, bg[1]!);
  const minimum = low <= high ? 1 : ratio(low, high);
  const maximum = Math.max(ratio(fg[0]!, bg[1]!), ratio(fg[1]!, bg[0]!));
  return {
    ratio: ratio(luminance(foreground), luminance(background)),
    minimum,
    maximum,
    threshold,
    assessment: minimum >= threshold ? 'pass' : maximum < threshold ? 'fail' : 'indeterminate',
    channelError,
  };
}
