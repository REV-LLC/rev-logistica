import {
  normalizeMeasurementLabel,
  normalizeSkuReference,
} from './catalog-reference-normalization';

describe('catalog reference normalization', () => {
  it.each([
    ['0.60M', '0,6 M'],
    ['0,60 M', '0,6 M'],
    ['60 CM', '0,6 M'],
    ['2.30M - 3.60M', '2,3 M - 3,6 M'],
    ['0,10 M x 0,60 M', '0,1 M X 0,6 M'],
  ])('normalizes %s as %s', (source, expected) => {
    expect(normalizeMeasurementLabel(source)).toBe(expected);
  });

  it.each([
    ['ANGULO DE 0.60 CM', '0.60M', 'ÁNGULO (0,6 M)'],
    ['ANGULO DE 0.30 MT', '0.30M', 'ÁNGULO (0,3 M)'],
    ['TENSOR DE 0.60 CM', '0.60M', 'TENSOR (0,6 M)'],
    [
      'FORMALETA (0,40)M x (0,35)M',
      '0,40 M x 0,35 M',
      'FORMALETA (0,4 M X 0,35 M)',
    ],
    [
      'GATO LARGO 2.30 - 3.60 MT',
      '2.30M - 3.60M',
      'GATO LARGO (2,3 M - 3,6 M)',
    ],
    ['DIAGONALES (3.00M)', '3.00M', 'DIAGONALES (3 M)'],
    ['ECOMAX 8 KVA', '8 KVA', 'ECOMAX 8 KVA'],
    ['INGERSOLL RAND DD-29', null, 'INGERSOLL RAND DD-29'],
    ['KOMATSU PC35R-8', 'PEQUEÑA', 'KOMATSU PC35R-8'],
    ['TABLERO ELECTRICO 110-220 V', null, 'TABLERO ELÉCTRICO 110-220 V'],
    ['CABLE PARA ANDAMIO 50,00M', null, 'CABLE PARA ANDAMIO 50 M'],
  ])('normalizes %s', (name, size, expected) => {
    expect(normalizeSkuReference(name, size)).toBe(expected);
  });
});
