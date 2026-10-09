import { ConflictException } from '@nestjs/common';
import { AccessoriesService } from './accessories.service';
import { AccessoryDocumentsService } from './accessory-documents.service';
import { AccessoryProviderReturnsService } from './accessory-provider-returns.service';
import { accessoryDocumentOptions } from './accessory-document-options';
import { prepareAccessoryDocumentItems } from './accessory-document-items';
import { assertLegacyImplementWritable, legacyImplementReadMetadata } from './implement-identity-rules';
import { AssetsService } from '../assets/assets.service';
import { InventoryService } from '../inventory/inventory.service';

const bridge = { assetId: 'native-unit' };

describe('Promoted implement identity runtime', () => {
  it('rejects legacy writes with a readable message and the native asset destination', () => {
    expect(() => assertLegacyImplementWritable({})).not.toThrow();
    expect(() => assertLegacyImplementWritable({ implementBridge: null })).not.toThrow();
    try {
      assertLegacyImplementWritable({ implementBridge: bridge });
      throw new Error('A promoted identity must not remain writable');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'IMPLEMENT_IDENTITY_PROMOTED', assetId: 'native-unit',
        assetUrl: '/inventory/serialized-assets/native-unit', message: expect.stringContaining('conserva únicamente su historial'),
      });
    }
  });

  it('keeps the previous identity readable, including unchanged historical balances and movements', async () => {
    const balances = [{ id: 'old-balance', quantity: 1 }];
    const movements = [{ id: 'old-movement', accessoryId: 'legacy' }];
    const prisma = {
      accessory: { findUnique: jest.fn().mockResolvedValue({ id: 'legacy', implementBridge: bridge, balances }) },
      accessoryMovement: { findMany: jest.fn().mockResolvedValue(movements) },
      accessoryRevision: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AccessoriesService(prisma as never);
    const item = await service.get('legacy');
    expect(item).toMatchObject({ readOnly: true, nativeAssetId: 'native-unit', nativeAssetUrl: '/inventory/serialized-assets/native-unit' });
    expect(item.balances).toBe(balances);
    expect((await service.history('legacy')).movements).toEqual(movements);
    expect(prisma.accessoryMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { accessoryId: 'legacy' } }));
    expect(legacyImplementReadMetadata({ implementBridge: null })).toEqual({ readOnly: false, nativeAssetId: null, nativeAssetUrl: null });
  });

  it('excludes promoted records from the legacy catalogue without archiving or deleting them', async () => {
    const prisma = { accessory: { findMany: jest.fn().mockResolvedValue([]) } };
    await new AccessoriesService(prisma as never).list();
    expect(prisma.accessory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ implementBridge: null }) }));
  });

  it('rejects direct edits after locking the previous identity, before compatibility or stock writes', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'legacy' }]),
      accessory: { findUniqueOrThrow: jest.fn().mockResolvedValue({ implementBridge: bridge }), update: jest.fn() },
      accessoryBalance: { updateMany: jest.fn() }, accessoryRevision: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn().mockImplementation(fn => fn(tx)) };
    await expect(new AccessoriesService(prisma as never).update('legacy', {} as never, 'office')).rejects.toThrow('registrado como equipo');
    expect(tx.accessory.update).not.toHaveBeenCalled();
    expect(tx.accessoryBalance.updateMany).not.toHaveBeenCalled();
    expect(tx.accessoryRevision.create).not.toHaveBeenCalled();
  });

  it('rejects every internal legacy movement, including replay, before reading or mutating stock', async () => {
    const tx = { accessory: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'legacy', implementBridge: bridge }) },
      accessoryMovement: { findUnique: jest.fn(), create: jest.fn() }, accessoryBalance: { updateMany: jest.fn(), upsert: jest.fn() } };
    await expect(new AccessoriesService({} as never).moveInTransaction(tx as never, 'legacy', { requestId: 'old-replay' } as never, 'office')).rejects.toThrow('registrado como equipo');
    expect(tx.accessoryMovement.findUnique).not.toHaveBeenCalled();
    expect(tx.accessoryMovement.create).not.toHaveBeenCalled();
    expect(tx.accessoryBalance.updateMany).not.toHaveBeenCalled();
    expect(tx.accessoryBalance.upsert).not.toHaveBeenCalled();
  });

  it.each(['REMISSION', 'RETURN'] as const)('excludes preserved legacy balances from the %s selector', async type => {
    const parent = { id: 'parent', active: true, deletedAt: null, warehouseCurrentId: 'warehouse',
      warehouseOwnerId: 'warehouse', sku: { assetFamilyId: 'family' } };
    const tx = { asset: { findUnique: jest.fn().mockResolvedValue(parent) },
      accessoryBalance: { findMany: jest.fn().mockResolvedValue([]) }, documentItem: { findMany: jest.fn().mockResolvedValue([]) } };
    await accessoryDocumentOptions(tx as never, { type, assetId: 'parent', customerWorksiteId: 'site', warehouseId: 'warehouse', deliveryMode: 'WAREHOUSE', page: 0 });
    expect(tx.accessoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ accessory: expect.objectContaining({ implementBridge: null }) }),
    }));
  });

  it('rejects stale legacy draft selections and shares the accessory lock with promotion', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'legacy' }]),
      accessory: { findMany: jest.fn().mockResolvedValue([{ id: 'legacy', implementBridge: bridge }]) },
      asset: { findMany: jest.fn().mockResolvedValue([{ id: 'parent', publicCode: 'equipment' }]) } };
    const items = [{ accessoryId: 'legacy', componentParentAssetId: 'parent', accessorySourceBalanceId: 'balance', quantity: 1 }];
    await expect(prepareAccessoryDocumentItems(tx as never, items as never, new Date('2026-09-30T12:00:00Z'))).rejects.toThrow('registrado como equipo');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR SHARE');
    expect(items[0]).toEqual({ accessoryId: 'legacy', componentParentAssetId: 'parent', accessorySourceBalanceId: 'balance', quantity: 1 });
  });

  it('rejects legacy approval before accessing the preserved balance or writing a movement', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'legacy' }]),
      customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'site' }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse', type: 'OWN' }) },
      asset: { findMany: jest.fn().mockResolvedValue([{ id: 'parent' }]) },
      accessory: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'legacy', implementBridge: bridge }) },
      accessoryBalance: { findUnique: jest.fn() } };
    const moveInTransaction = jest.fn();
    await expect(new AccessoryDocumentsService({ moveInTransaction } as never).apply(tx as never, {
      id: 'draft', type: 'REMISSION', docDate: new Date('2026-09-30T12:00:00Z'), warehouseId: 'warehouse', customerWorksiteId: 'site',
      items: [{ accessoryId: 'legacy', componentParentAssetId: 'parent', accessorySourceBalanceId: 'balance' }],
    } as never, 'office')).rejects.toThrow('registrado como equipo');
    expect(tx.accessoryBalance.findUnique).not.toHaveBeenCalled();
    expect(moveInTransaction).not.toHaveBeenCalled();
  });

  it('excludes promoted provider returns and rejects stale provider receipts', async () => {
    const prisma = { accessoryMovement: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new AccessoryProviderReturnsService(prisma as never, {} as never);
    await service.listPending({ id: 'office', role: 'OFFICE' });
    expect(prisma.accessoryMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accessory: expect.objectContaining({ implementBridge: null }) }) }));
    const tx = { accessoryMovement: { findUnique: jest.fn().mockResolvedValue({ accessory: { implementBridge: bridge } }) },
      accessoryBalance: { findUnique: jest.fn() } };
    await expect(service.prepare(tx as never, 'source', 'provider', [{ sourceMovementId: 'legacy-return', quantity: 1 }])).rejects.toThrow('registrado como equipo');
    expect(tx.accessoryBalance.findUnique).not.toHaveBeenCalled();
  });

  it('does not treat preserved legacy balances as equipment custody or block its native movement', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ assignedMotorId: null, isAssignedMotor: false }]),
      retiredMotorConfiguration: { findUnique: jest.fn().mockResolvedValue(null) },
      accessoryBalance: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) } };
    const inventory = Object.create(InventoryService.prototype) as any;
    await inventory.assertNoUnremittedAccessories(tx, ['parent']);
    const assets = new AssetsService({} as never, {} as never) as any;
    await assets.assertNoAssignedAccessories(tx, 'parent');
    for (const query of [tx.accessoryBalance.findFirst, tx.accessoryBalance.count])
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accessory: { implementBridge: null } }) }));
  });

  it('exposes the previous read-only history from the native asset detail without duplicating catalogue identity', async () => {
    const prisma = { asset: { findUnique: jest.fn().mockResolvedValue({ id: 'native-unit', hourMeter: 0, implementBridge: { accessoryId: 'legacy' } }) } };
    const result = await new AssetsService(prisma as never, {} as never).getAssetById('native-unit');
    expect(result).toMatchObject({ id: 'native-unit', legacyAccessoryId: 'legacy', legacyAccessoryHistoryUrl: '/accessories/legacy/history' });
    expect(prisma.asset.findUnique).toHaveBeenCalledTimes(1);
  });
});
