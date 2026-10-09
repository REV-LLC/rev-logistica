import { effectiveCommercialProfile } from './commercial-history';
import { CommercialProfilesService } from './commercial-profiles.service';

const revision = { version: 1, effectiveFrom: new Date('2026-10-01T00:00:00Z'), payload: { groups: [], modes: [] } };
const family = { id: 'family-profile', scopeType: 'FAMILY', scopeId: 'family', revisions: [revision] };
const sku = { ...family, id: 'sku-profile', scopeType: 'SKU', scopeId: 'sku' };
const asset = { ...family, id: 'asset-profile', scopeType: 'ASSET', scopeId: 'asset' };

describe('shared families do not share implement prices', () => {
  it('keeps family defaults for equipment, but never for an implement', async () => {
    const findMany = jest.fn().mockResolvedValue([family]);
    const tx = { commercialProfile: { findMany } } as any;
    const target = { assetId: 'asset', skuId: 'sku', familyId: 'family' };
    expect((await effectiveCommercialProfile(tx, target, '2026-10-07'))?.id).toBe(family.id);
    expect(await effectiveCommercialProfile(tx, { ...target, isImplement: true }, '2026-10-07')).toBeNull();
    expect(findMany.mock.calls[1][0].where.OR).toEqual([
      { scopeType: 'ASSET', scopeId: 'asset' }, { scopeType: 'SKU', scopeId: 'sku' },
    ]);
  });

  it('preserves the implement asset price, then its own reference price', async () => {
    const findMany = jest.fn().mockResolvedValue([family, sku, asset]);
    const tx = { commercialProfile: { findMany } } as any;
    const target = { assetId: 'asset', skuId: 'sku', familyId: 'family', isImplement: true };
    expect((await effectiveCommercialProfile(tx, target, '2026-10-07'))?.id).toBe(asset.id);
    findMany.mockResolvedValue([family, sku]);
    expect((await effectiveCommercialProfile(tx, target, '2026-10-07'))?.id).toBe(sku.id);
  });

  it('does not query an empty scope list for a bulk implement inherited-profile lookup', async () => {
    const findMany = jest.fn();
    expect(await effectiveCommercialProfile({ commercialProfile: { findMany } } as any,
      { familyId: 'family', isImplement: true }, '2026-10-07')).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('also protects a serialized reference whose asset flag marks it as an implement', async () => {
    const skuId = '00000000-0000-4000-8000-000000000001';
    const findMany = jest.fn();
    const prisma = {
      sku: { count: jest.fn().mockResolvedValue(1), findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: skuId, assetFamilyId: 'family', isImplement: false, assets: [{ id: 'implement-asset' }],
      }) },
      commercialProfile: { findUnique: jest.fn().mockResolvedValue(null), findMany },
    };
    const result = await new CommercialProfilesService(prisma as any).get('SKU', skuId);
    expect(result.inherited).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
