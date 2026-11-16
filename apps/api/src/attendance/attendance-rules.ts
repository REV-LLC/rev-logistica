import { BadRequestException } from '@nestjs/common';

export function distanceMeters(a: number, b: number, c: number, d: number) {
  const rad = Math.PI / 180;
  const x =
    Math.sin(((c - a) * rad) / 2) ** 2 +
    Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
export function cosineSimilarity(a: number[], b: number[]) {
  if (
    a.length !== 128 ||
    b.length !== 128 ||
    ![...a, ...b].every(Number.isFinite)
  )
    throw new BadRequestException('Referencia facial inválida');
  const norm = Math.hypot(...a) * Math.hypot(...b);
  if (!norm) throw new BadRequestException('Referencia facial inválida');
  return Math.max(
    -1,
    Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0) / norm),
  );
}
export function verificationReasons(input: {
  similarity: number | null;
  threshold: number;
  referenceCompatible: boolean;
  distance: number | null;
  radius: number;
  accuracy: number;
}) {
  const reasons: string[] = [];
  if (!input.referenceCompatible) reasons.push('NO_APPROVED_REFERENCE');
  else if (input.similarity === null || input.similarity < input.threshold)
    reasons.push('FACE_MISMATCH');
  if (input.distance === null) reasons.push('WORKSITE_LOCATION_MISSING');
  else if (input.distance > input.radius) reasons.push('OUTSIDE_WORKSITE');
  if (input.accuracy > Math.min(input.radius, 100))
    reasons.push('LOW_LOCATION_ACCURACY');
  return reasons;
}
