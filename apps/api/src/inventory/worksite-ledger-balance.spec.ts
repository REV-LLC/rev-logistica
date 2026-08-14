import { MovementType } from '@prisma/client';
import { getWorksiteQuantityDelta } from './worksite-ledger-balance';

describe('getWorksiteQuantityDelta', () => {
  it('treats a warehouse OUT as stock arriving at its associated worksite', () => {
    expect(getWorksiteQuantityDelta(MovementType.OUT, -1)).toBe(1);
    expect(getWorksiteQuantityDelta(MovementType.OUT, -40)).toBe(40);
  });

  it('keeps direct ON_SITE deliveries positive', () => {
    expect(getWorksiteQuantityDelta(MovementType.ON_SITE, 3)).toBe(3);
  });

  it('subtracts completed and in-transit returns from the worksite', () => {
    expect(getWorksiteQuantityDelta(MovementType.IN, 2)).toBe(-2);
    expect(getWorksiteQuantityDelta(MovementType.TRANSIT, 4)).toBe(-4);
  });

  it('ignores warehouse-only adjustments', () => {
    expect(getWorksiteQuantityDelta(MovementType.ADJUST, 7)).toBe(0);
  });
});
