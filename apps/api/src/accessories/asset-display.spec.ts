import { assetDisplayName } from './asset-display';
import { EquipmentConfigurationService } from './equipment-configuration.service';

describe('Readable equipment presentation', () => {
  const asset = { id: 'unit-id', publicCode: 'MINICARGADOR-ESTANDAR-5353-0003',
    description: 'New Holland', internalNumber: 3, sku: { name: 'MINICARGADOR', assetFamilyId: 'family-id' },
    warehouseOwner: { name: 'Motavita' }, warehouseOwnerId: 'owner-id', warehouseCurrentId: 'warehouse-id' };

  it('uses a readable name, number and owner, never a public code or UUID fallback', () => {
    expect(assetDisplayName(asset)).toBe('New Holland #3 · Motavita');
    expect(assetDisplayName({ ...asset, description: ' ', internalNumber: 2 })).toBe('MINICARGADOR #2 · Motavita');
    expect(assetDisplayName(null)).toBe('Equipo');
    expect(assetDisplayName({ internalNumber: 0 })).toBe('Equipo #0');
  });

  it('configuration headers keep real identity and request display metadata for every linked unit', async () => {
    const prisma = { asset: { findFirst: jest.fn().mockResolvedValue(asset) },
      equipmentConfiguration: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new EquipmentConfigurationService(prisma as never, {} as never);
    const result = await service.get({ assetId: asset.id });
    expect(result.parent).toEqual({ name: 'New Holland #3 · Motavita', familyId: 'family-id', ownerWarehouseId: 'owner-id', warehouseId: 'warehouse-id' });
    expect(prisma.asset.findFirst.mock.calls[0][0].where.id).toBe(asset.id);
    expect(prisma.equipmentConfiguration.findUnique.mock.calls[0][0].include.entries.include.asset.select)
      .toMatchObject({ internalNumber: true, description: true, warehouseOwner: { select: { name: true } } });
  });

  it('picker includes human metadata while retaining original candidate IDs and codes for searching', async () => {
    const findMany = jest.fn().mockResolvedValue([asset]);
    const service = new EquipmentConfigurationService({ asset: { findMany } } as never, {} as never);
    const result = await service.assetCandidates('New Holland');
    expect(findMany.mock.calls[0][0].select).toMatchObject({ id: true, publicCode: true, internalNumber: true, description: true, warehouseOwner: { select: { name: true } } });
    expect(result.items[0]).toMatchObject(asset);
    expect(result.items[0].id).toBe(asset.id);
    expect(result.items[0].publicCode).toBe(asset.publicCode);
  });

  it('preserves the owner without fabricating a warehouse location for equipment on a worksite', async () => {
    const prisma = { asset: { findFirst: jest.fn().mockResolvedValue({ ...asset, warehouseCurrentId: null }) },
      equipmentConfiguration: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new EquipmentConfigurationService(prisma as never, {} as never);
    expect((await service.get({ assetId: asset.id })).parent).toMatchObject({ ownerWarehouseId: 'owner-id', warehouseId: null });
  });
});
