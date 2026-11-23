/**
 * WCAG claims must never round up across a threshold. The multiplication can
 * itself round upward at an integer boundary; compare the serialized value
 * against the original before accepting it. Precision remains four decimals.
 */
export function serializeWcagRatio(ratio: number): number {
  const factor = 10000;
  const units = Math.floor(ratio * factor);
  const serialized = units / factor;
  return serialized > ratio ? (units - 1) / factor : serialized;
}
