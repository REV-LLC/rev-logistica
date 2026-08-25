export type CanonicalJackReference = {
  subfamilyCode: string;
  subfamilyName: string;
  referenceCode: string;
  referenceName: string;
  skuName: string;
  lengthMeters: number;
};

export const CANONICAL_JACK_REFERENCES = [
  {
    subfamilyCode: 'GATO',
    subfamilyName: 'GATO',
    referenceCode: 'EXTRA_CORTO',
    referenceName: 'EXTRA CORTO',
    skuName: 'GATO EXTRA CORTO (1.00 M)',
    lengthMeters: 1,
  },
  {
    subfamilyCode: 'GATO',
    subfamilyName: 'GATO',
    referenceCode: 'CORTO',
    referenceName: 'CORTO',
    skuName: 'GATO CORTO (2.00 M)',
    lengthMeters: 2,
  },
  {
    subfamilyCode: 'GATO',
    subfamilyName: 'GATO',
    referenceCode: 'MEDIANO',
    referenceName: 'MEDIANO',
    skuName: 'GATO MEDIANO (3.00 M)',
    lengthMeters: 3,
  },
  {
    subfamilyCode: 'GATO',
    subfamilyName: 'GATO',
    referenceCode: 'LARGO',
    referenceName: 'LARGO',
    skuName: 'GATO LARGO (4.00 M)',
    lengthMeters: 4,
  },
  {
    subfamilyCode: 'GATO',
    subfamilyName: 'GATO',
    referenceCode: 'EXTRA_LARGO',
    referenceName: 'EXTRA LARGO',
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

export const getCanonicalJackReference = (
  referenceIdentity: string | null | undefined,
) => {
  if (!referenceIdentity) return null;
  const identity = normalizeIdentity(referenceIdentity);
  return (
    CANONICAL_JACK_REFERENCES.find((reference) => {
      const aliases = [reference.referenceCode, `GATO_${reference.referenceCode}`];
      return aliases.some((alias) => identity === alias || identity.startsWith(`${alias}_`));
    }) ?? null
  );
};

export const isCanonicalJackSubfamily = (value: string | null | undefined) =>
  value ? normalizeIdentity(value) === 'GATO' : false;

export const isJackIdentity = (value: string | null | undefined) =>
  value
    ? normalizeIdentity(value).startsWith('GATO_') ||
      normalizeIdentity(value) === 'GATO'
    : false;
