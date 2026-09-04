import {
  buildSerializedWarehouseAvailability,
  isSerializedAvailable,
} from './serialized-warehouse-availability';

describe('serialized warehouse availability', () => {
  it('subtracts on-site assignments from the warehouse balance', () => {
    const result = buildSerializedWarehouseAvailability(
      [{ assetId: 'asset-1', _sum: { quantity: 1 } }],
      [{ assetId: 'asset-1', _sum: { quantity: 1 } }],
    );

    expect(result.get('asset-1')).toBe(0);
    expect(isSerializedAvailable(result.get('asset-1'))).toBe(false);
  });

  it('only accepts an exact unit balance', () => {
    expect(isSerializedAvailable(1)).toBe(true);
    expect(isSerializedAvailable(0)).toBe(false);
    expect(isSerializedAvailable(2)).toBe(false);
    expect(isSerializedAvailable(undefined)).toBe(false);
  });
});
