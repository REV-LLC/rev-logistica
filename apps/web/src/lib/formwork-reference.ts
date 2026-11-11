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
