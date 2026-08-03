import { legacyInventoryQuantityMultiplier } from './legacy-inventory-quantity';

describe('legacyInventoryQuantityMultiplier', () => {
  it.each(['40', '42'])(
    'converts legacy scaffold body article %s into two naves',
    (articleCode) => {
      expect(legacyInventoryQuantityMultiplier(articleCode)).toBe(2);
    },
  );

  it('keeps all other legacy articles at one-to-one', () => {
    expect(legacyInventoryQuantityMultiplier('41')).toBe(1);
  });

  it('uses an explicit valid multiplier when the mapping provides one', () => {
    expect(legacyInventoryQuantityMultiplier('40', 3)).toBe(3);
  });
});
