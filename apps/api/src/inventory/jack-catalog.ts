export type CanonicalJackReference = {
  subfamilyCode: string;
  subfamilyName: string;
  skuName: string;
  lengthMeters: number;
};

export const CANONICAL_JACK_REFERENCES = [
  {
    subfamilyCode: 'GATO_EXTRA_CORTO',
    subfamilyName: 'GATO EXTRA CORTO',
    skuName: 'GATO EXTRA CORTO (1.00 M)',
    lengthMeters: 1,
  },
  {
    subfamilyCode: 'GATO_CORTO',
    subfamilyName: 'GATO CORTO',
    skuName: 'GATO CORTO (2.00 M)',
    lengthMeters: 2,
  },
  {
    subfamilyCode: 'GATO_MEDIANO',
    subfamilyName: 'GATO MEDIANO',
    skuName: 'GATO MEDIANO (3.00 M)',
    lengthMeters: 3,
  },
  {
    subfamilyCode: 'GATO_LARGO',
    subfamilyName: 'GATO LARGO',
    skuName: 'GATO LARGO (4.00 M)',
    lengthMeters: 4,
  },
  {
    subfamilyCode: 'GATO_EXTRA_LARGO',
    subfamilyName: 'GATO EXTRA LARGO',
    skuName: 'GATO EXTRA LARGO (6.00 M)',
    lengthMeters: 6,
  },
] as const satisfies readonly CanonicalJackReference[];

const normalizeIdentity = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const canonicalBySubfamilyCode = new Map<string, CanonicalJackReference>(
  CANONICAL_JACK_REFERENCES.map((reference) => [
    reference.subfamilyCode,
    reference,
  ]),
);

export const getCanonicalJackReference = (
  subfamilyIdentity: string | null | undefined,
) =>
  subfamilyIdentity
    ? (canonicalBySubfamilyCode.get(normalizeIdentity(subfamilyIdentity)) ??
      null)
    : null;

export const isJackIdentity = (value: string | null | undefined) =>
  value
    ? normalizeIdentity(value).startsWith('GATO_') ||
      normalizeIdentity(value) === 'GATO'
    : false;
