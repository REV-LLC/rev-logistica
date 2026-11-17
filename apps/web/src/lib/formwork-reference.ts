export type FormaletaLine = 'FORMALETA' | 'FORMALETA_SARDINEL' | 'RINCONERA';

export function buildFormaletaSkuName(
  line: FormaletaLine,
  x: number,
  y: number,
  z?: number,
): string | null {
  const measures = line === 'RINCONERA' ? [x, y, z] : [x, y];
  if (measures.some((value) => value == null || !Number.isFinite(value) || value < 0.005)) {
    return null;
  }
  const prefix = line === 'FORMALETA_SARDINEL' ? 'FORMALETA SARDINEL' : line;
  return `${prefix} (${measures.map((value) => `${value!.toFixed(2)} M`).join(' X ')})`;
}

export function cornerAreaM2(x: number, y: number, length: number): number | null {
  if (![x, y, length].every(value => Number.isFinite(value) && value >= 0.005)) return null;
  // Reference dimensions are stored in metres to two decimals.
  const [sideX, sideY, height] = [x, y, length].map(value => Math.round(value * 100));
  return (sideX + sideY) * height / 10000;
}
