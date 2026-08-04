import { bulkSkuCanonicalKey, normalizeBulkSkuInput } from './bulk-sku-normalization';

describe('bulk SKU normalization', () => {
  it.each([
    'punta apt 30mt',
    ' PUNTA   APT (30.00 M) ',
    'Punta Apt 30 metros',
  ])('normalizes %s to one canonical reference', (name) => {
    expect(normalizeBulkSkuInput({ name })).toEqual({
      name: 'PUNTA APT (30.00 M)',
      lengthMeters: 30,
    });
  });

  it('uses the structured length over a suffix typed in the name', () => {
    expect(normalizeBulkSkuInput({ name: 'Punta APT 20mt', lengthMeters: 30 })).toEqual({
      name: 'PUNTA APT (30.00 M)',
      lengthMeters: 30,
    });
  });

  it('keeps references without a length in uppercase', () => {
    expect(bulkSkuCanonicalKey({ name: '  cruceta apt  ' })).toBe('CRUCETA APT');
  });

  it('uses an accent-insensitive key to prevent orthographic duplicates', () => {
    expect(bulkSkuCanonicalKey({ name: 'Manguera de desagüe 11 mts' })).toBe(
      'MANGUERA DE DESAGUE (11.00 M)',
    );
  });
});
