import {
  CANONICAL_JACK_REFERENCES,
  getCanonicalJackReference,
  isJackIdentity,
} from './jack-catalog';

describe('canonical jack catalog', () => {
  it('contains exactly the five supported jack classifications', () => {
    expect(
      CANONICAL_JACK_REFERENCES.map((reference) => reference.skuName),
    ).toEqual([
      'GATO EXTRA CORTO (1.00 M)',
      'GATO CORTO (2.00 M)',
      'GATO MEDIANO (3.00 M)',
      'GATO LARGO (4.00 M)',
      'GATO EXTRA LARGO (6.00 M)',
    ]);
  });

  it.each([
    ['gato extra corto', 'GATO EXTRA CORTO (1.00 M)'],
    ['GATO_CORTO', 'GATO CORTO (2.00 M)'],
    ['gato-mediano', 'GATO MEDIANO (3.00 M)'],
    ['GATO LARGO', 'GATO LARGO (4.00 M)'],
    ['gato_extra_largo', 'GATO EXTRA LARGO (6.00 M)'],
  ])('resolves %s to its canonical reference', (identity, expectedName) => {
    expect(getCanonicalJackReference(identity)?.skuName).toBe(expectedName);
  });

  it('recognizes unsupported jack identities without accepting them as canonical', () => {
    expect(isJackIdentity('GATO SUPER LARGO')).toBe(true);
    expect(getCanonicalJackReference('GATO SUPER LARGO')).toBeNull();
  });
});
