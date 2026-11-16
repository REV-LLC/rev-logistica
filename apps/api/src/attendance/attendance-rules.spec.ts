import {
  cosineSimilarity,
  distanceMeters,
  verificationReasons,
} from './attendance-rules';
describe('Attendance verification rules', () => {
  const base = {
    similarity: 0.8,
    threshold: 0.45,
    referenceCompatible: true,
    distance: 20,
    radius: 200,
    accuracy: 10,
  };
  it('only verifies both identity and location', () =>
    expect(verificationReasons(base)).toEqual([]));
  it('does not verify a missing reference even with a high score', () =>
    expect(
      verificationReasons({ ...base, referenceCompatible: false }),
    ).toContain('NO_APPROVED_REFERENCE'));
  it('requires review for no coordinates, mismatch, or poor GPS', () =>
    expect(
      verificationReasons({
        ...base,
        similarity: 0.2,
        distance: null,
        accuracy: 150,
      }),
    ).toEqual([
      'FACE_MISMATCH',
      'WORKSITE_LOCATION_MISSING',
      'LOW_LOCATION_ACCURACY',
    ]));
  it('does not let GPS accuracy expand the allowed radius', () =>
    expect(
      verificationReasons({ ...base, distance: 230, accuracy: 50 }),
    ).toContain('OUTSIDE_WORKSITE'));
  it('calculates meter distances in both hemispheres', () => {
    expect(distanceMeters(0, 0, 0, 0)).toBe(0);
    expect(distanceMeters(0, 0, 0, 1)).toBeCloseTo(111194.9, 0);
  });
  it('compares embeddings and rejects malformed vectors', () => {
    const a = Array(128).fill(0);
    a[0] = 1;
    expect(cosineSimilarity(a, a)).toBe(1);
    expect(
      cosineSimilarity(
        a,
        a.map((v) => -v),
      ),
    ).toBe(-1);
    expect(() => cosineSimilarity([1], [1])).toThrow();
    expect(() => cosineSimilarity(Array(128).fill(0), a)).toThrow();
  });
});
