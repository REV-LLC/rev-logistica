import { ParseUUIDPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { AssetKind, AssetMotorConfiguration, DocumentType, MovementType, Role, WarehouseType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('owner asset catalogue', () => {
  const provider = { id: 'provider', name: 'Provider warehouse', type: WarehouseType.ALLY };
  const custody = { id: 'own-warehouse', name: 'Own warehouse', type: WarehouseType.OWN };
  const site = { id: 'customer-site', alias: 'Caney', worksite: { name: 'Obra vial' } };
  const registered = new Date('2026-09-07T12:00:00Z');
  const delivered = new Date('2026-09-01T12:00:00Z');

  function movement(overrides: Record<string, any> = {}) {
    return {
      id: 'opening', assetId: 'asset', ownerWarehouseId: provider.id,
      movementType: MovementType.ADJUST, quantity: 1,
      isOpeningBalance: true, effectiveAt: registered, createdAt: registered,
      refDocumentId: null, refDocumentType: null,
      warehouse: provider, customerWorksite: null,
      ...overrides,
    };
  }

  function asset(overrides: Record<string, any> = {}) {
    return {
      id: 'asset', skuId: 'sku', warehouseOwnerId: provider.id,
      // A cached asset warehouse is deliberately present even in unknown cases;
      // only ledger location can establish physical availability.
      warehouseCurrentId: provider.id,
      serialOrEngine: 'EC-10', registrationNumber: 'REG-1', description: 'Equipment',
      brand: 'ECOMAX', model: 'M1', internalNumber: 1,
      active: true, deletedAt: null,
      kind: AssetKind.STANDARD, motorConfiguration: AssetMotorConfiguration.NONE,
      assignedMotorId: null, assignedToMixer: null, weight: null,
      imageFileObjectId: null, imageFileObject: null,
      sku: {
        name: 'ECOMAX reference', imageUrl: 'https://example.test/reference.jpg',
        imageFileObjectId: 'sku-image', imageFileObject: null,
        assetFamily: { id: 'family', code: 'VIBRADOR', name: 'Vibradores' },
        assetSubfamily: { id: 'subfamily', code: 'STANDARD', name: 'Estándar' },
      },
      ledger: [movement()],
      ...overrides,
    };
  }

  function setup(rows: ReturnType<typeof asset>[] = [asset()]) {
    const warehouseFind = jest.fn(async ({ where }) => where.id === provider.id
      ? { ...provider, ownerCompany: { name: 'Equipment company' } }
      : null);
    // The adapter interprets the relevant Prisma filters/order rather than
    // presorting fixtures. Production PostgreSQL coverage lives in the API
    // integration test; these assertions cover catalogue projection semantics.
    const assetFind = jest.fn(async ({ where, select }) => rows
      .filter((row) => row.warehouseOwnerId === where.warehouseOwnerId && row.deletedAt === where.deletedAt)
      .map((row) => ({
        ...row,
        ledger: [...row.ledger].sort((left, right) => {
          for (const clause of select.ledger.orderBy) {
            const [key, direction] = Object.entries(clause)[0];
            const a = left[key] instanceof Date ? left[key].getTime() : left[key];
            const b = right[key] instanceof Date ? right[key].getTime() : right[key];
            if (a !== b) return (a > b ? 1 : -1) * (direction === 'desc' ? -1 : 1);
          }
          return 0;
        }).slice(0, select.ledger.take),
      })));
    const transferFind = jest.fn(async ({ where }) => rows.flatMap((row) => row.ledger)
      .filter((row) => row.movementType === where.movementType
        && Number(row.quantity) > where.quantity.gt
        && row.isOpeningBalance === where.isOpeningBalance
        && row.warehouse !== null
        && row.customerWorksite === null
        && where.OR.some((event: Record<string, unknown>) => Object.entries(event).every(([key, value]) =>
          value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value))));
    const prisma = {
      warehouse: { findUnique: warehouseFind },
      asset: { findMany: assetFind },
      stockLedger: { findMany: transferFind },
    };
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    return {
      service: new InventoryService(prisma as never, cache as never),
      assetFind, warehouseFind, transferFind, cache,
    };
  }

  it('retains provider equipment at a worksite when catalogue registration happened later', async () => {
    const { service, assetFind, transferFind } = setup([asset({ ledger: [
      movement(),
      movement({ id: 'delivery', isOpeningBalance: false, movementType: MovementType.ON_SITE,
        effectiveAt: delivered, warehouse: null, customerWorksite: site }),
    ] })]);
    const result = await service.getOwnerAssetCatalog(provider.id);
    expect(result.warehouseId).toBe(provider.id);
    expect(result.serial).toEqual([expect.objectContaining({
      assetId: 'asset', ownerWarehouseId: provider.id, status: 'OUT', quantity: 0,
      location: { type: 'WORKSITE', id: site.id, name: 'Caney', warehouseType: null },
      isAvailableInOwnerWarehouse: false,
    })]);
    expect(assetFind).toHaveBeenCalledTimes(1);
    expect(assetFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { warehouseOwnerId: provider.id, deletedAt: null },
      select: expect.objectContaining({ ledger: expect.objectContaining({
        take: 1,
        orderBy: [{ isOpeningBalance: 'asc' }, { effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }) }),
    }));
    expect(transferFind).not.toHaveBeenCalled();
  });

  it('retains ownership in custody without claiming provider stock', async () => {
    const { service } = setup([asset({ ledger: [movement({ warehouse: custody })] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      ownerWarehouseId: provider.id,
      status: 'IN', quantity: 0, isAvailableInOwnerWarehouse: false,
      location: { type: 'WAREHOUSE', id: custody.id, name: custody.name, warehouseType: 'OWN' },
    });
  });

  it('counts a completed return at the provider even when the IN keeps its origin worksite', async () => {
    const { service } = setup([asset({ ledger: [movement({
      movementType: MovementType.IN, isOpeningBalance: false, customerWorksite: site,
    })] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'IN', quantity: 1, isAvailableInOwnerWarehouse: true,
      location: { type: 'WAREHOUSE', id: provider.id, name: provider.name, warehouseType: 'ALLY' },
    });
  });

  it('shows transit separately from the worksite referenced by the return', async () => {
    const { service } = setup([asset({ ledger: [movement({
      movementType: MovementType.TRANSIT, isOpeningBalance: false,
      warehouse: null, customerWorksite: site,
    })] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'TRANSIT', quantity: 0, isAvailableInOwnerWarehouse: false,
      location: { type: 'TRANSIT', id: null, name: null, warehouseType: null },
    });
  });

  it('includes inactive equipment but excludes deleted equipment and other warehouse owners', async () => {
    const { service, assetFind } = setup([
      asset({ id: 'inactive', active: false }),
      asset({ id: 'deleted', deletedAt: registered }),
      asset({ id: 'different-owner', warehouseOwnerId: custody.id }),
    ]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial).toEqual([
      expect.objectContaining({
        assetId: 'inactive', active: false, status: 'INACTIVE', quantity: 0,
        isAvailableInOwnerWarehouse: false,
        location: { type: 'WAREHOUSE', id: provider.id, name: provider.name, warehouseType: 'ALLY' },
      }),
    ]);
    expect(assetFind.mock.calls[0][0].where).toEqual({ warehouseOwnerId: provider.id, deletedAt: null });
  });

  it.each([
    ['no history', []],
    ['negative adjustment', [movement({ quantity: -1 })]],
    ['zero adjustment', [movement({ quantity: 0 })]],
    ['negative receipt', [movement({ movementType: MovementType.IN, quantity: -1 })]],
    ['receipt without warehouse', [movement({ movementType: MovementType.IN, warehouse: null })]],
    ['out without destination', [movement({ movementType: MovementType.OUT, customerWorksite: null })]],
    ['history with another owner', [movement({ ownerWarehouseId: custody.id })]],
  ])('keeps %s UNKNOWN rather than available', async (_label, ledger) => {
    const { service } = setup([asset({ ledger })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'UNKNOWN', quantity: 0, isAvailableInOwnerWarehouse: false,
      location: { type: 'UNKNOWN', id: null, name: null, warehouseType: null },
    });
  });

  it.each([
    [DocumentType.PROVIDER_PICKUP, custody, 0],
    [DocumentType.PROVIDER_RECEIPT, provider, 1],
  ])('uses the destination of a paired %s when UUID ordering puts OUT last', async (refDocumentType, destination, quantity) => {
    const event = { isOpeningBalance: false, refDocumentId: 'transfer', refDocumentType };
    const { service, transferFind } = setup([asset({ ledger: [
      movement({ ...event, id: '0000-in', movementType: MovementType.IN, warehouse: destination }),
      movement({ ...event, id: 'ffff-out', movementType: MovementType.OUT, quantity: -1 }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'IN', quantity,
      isAvailableInOwnerWarehouse: quantity === 1,
      location: { type: 'WAREHOUSE', id: destination.id, name: destination.name, warehouseType: destination.type },
    });
    expect(transferFind).toHaveBeenCalledTimes(1);
    expect(transferFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      OR: [{ assetId: 'asset', ownerWarehouseId: provider.id, refDocumentId: 'transfer', refDocumentType,
        effectiveAt: registered, createdAt: registered }],
      movementType: MovementType.IN, isOpeningBalance: false,
    }) }));
  });

  it.each(['different-document', 'different-time'])('does not borrow an IN from a %s transfer', async (difference) => {
    const event = { isOpeningBalance: false, refDocumentId: 'transfer', refDocumentType: DocumentType.PROVIDER_PICKUP };
    const { service } = setup([asset({ ledger: [
      movement({ ...event, id: '0000-in', movementType: MovementType.IN, warehouse: custody,
        ...(difference === 'different-document' ? { refDocumentId: 'older-transfer' } : { effectiveAt: delivered }),
      }),
      movement({ ...event, id: 'ffff-out', movementType: MovementType.OUT, quantity: -1 }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'UNKNOWN', quantity: 0, location: { type: 'UNKNOWN' },
    });
  });

  it('does not choose between ambiguous multiple transfer destinations', async () => {
    const event = { isOpeningBalance: false, refDocumentId: 'transfer', refDocumentType: DocumentType.PROVIDER_PICKUP };
    const { service } = setup([asset({ ledger: [
      movement({ ...event, id: '0000-in', movementType: MovementType.IN, warehouse: custody }),
      movement({ ...event, id: '0001-in', movementType: MovementType.IN, warehouse: provider }),
      movement({ ...event, id: 'ffff-out', movementType: MovementType.OUT, quantity: -1 }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({ status: 'UNKNOWN', quantity: 0 });
  });

  it('returns edit metadata and prefers equipment images over reference images', async () => {
    const { service } = setup([asset({ imageFileObjectId: 'asset-image', imageFileObject: { storageKey: '/asset.jpg' } })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      skuId: 'sku', ownerWarehouseName: 'Equipment company | Provider warehouse',
      serialOrEngine: 'EC-10', registrationNumber: 'REG-1', description: 'Equipment',
      brand: 'ECOMAX', model: 'M1', skuName: 'ECOMAX reference', internalNumber: 1,
      imageFileObjectId: 'asset-image', imageUrl: '/asset.jpg',
      assetFamily: { id: 'family', code: 'VIBRADOR', name: 'Vibradores' },
      assetSubfamily: { id: 'subfamily', code: 'STANDARD', name: 'Estándar' },
    });
  });

  it('rejects an unknown warehouse without querying an unscoped catalogue', async () => {
    const { service, assetFind } = setup();
    await expect(service.getOwnerAssetCatalog('missing')).rejects.toThrow('Warehouse not found');
    expect(assetFind).not.toHaveBeenCalled();
  });

  it('exposes the catalogue route with the same JWT, roles and UUID protections as warehouse inventory', async () => {
    const handler = InventoryController.prototype.getOwnerAssetCatalog;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('owner/:warehouseId/assets');
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.ADMIN, Role.OFFICE, Role.DRIVER]);
    const parameters = Reflect.getMetadata(ROUTE_ARGS_METADATA, InventoryController, 'getOwnerAssetCatalog');
    expect(Object.values(parameters)).toEqual([expect.objectContaining({
      data: 'warehouseId', pipes: [expect.any(ParseUUIDPipe)],
    })]);
    const getOwnerAssetCatalog = jest.fn().mockResolvedValue({ warehouseId: provider.id, serial: [] });
    const controller = new InventoryController({ getOwnerAssetCatalog } as never);
    await expect(controller.getOwnerAssetCatalog(provider.id)).resolves.toEqual({ warehouseId: provider.id, serial: [] });
    expect(getOwnerAssetCatalog).toHaveBeenCalledWith(provider.id);
  });
});
