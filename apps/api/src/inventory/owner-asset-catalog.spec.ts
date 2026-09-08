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
    const result = {
      id: 'opening', assetId: 'asset', ownerWarehouseId: provider.id,
      movementType: MovementType.ADJUST, quantity: 1,
      isOpeningBalance: true, effectiveAt: registered, createdAt: registered,
      refDocumentId: null, refDocumentType: null,
      warehouse: provider, customerWorksite: null,
      ...overrides,
    };
    return {
      ...result,
      warehouseId: result.warehouse?.id ?? null,
      customerWorksiteId: result.customerWorksite?.id ?? null,
    };
  }

  function asset(overrides: Record<string, any> = {}) {
    const result = {
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
    return { ...result, ledger: result.ledger.map((entry) => ({ ...entry, assetId: result.id })) };
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
      .filter((row) => where.OR.some((event: Record<string, unknown>) => Object.entries(event).every(([key, value]) =>
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
      movement({ ...event, id: 'ffff-out', movementType: MovementType.OUT, quantity: -1,
        warehouse: destination.id === provider.id ? custody : provider }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'IN', quantity,
      isAvailableInOwnerWarehouse: quantity === 1,
      location: { type: 'WAREHOUSE', id: destination.id, name: destination.name, warehouseType: destination.type },
    });
    expect(transferFind).toHaveBeenCalledTimes(1);
    expect(transferFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ assetId: 'asset', refDocumentId: 'transfer' }] },
    }));
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

  it('uses a complete transfer destination when the IN UUID is greatest', async () => {
    const event = { isOpeningBalance: false, refDocumentId: 'transfer', refDocumentType: DocumentType.PROVIDER_PICKUP };
    const { service, transferFind } = setup([asset({ ledger: [
      movement({ ...event, id: 'ffff-in', movementType: MovementType.IN, warehouse: custody }),
      movement({ ...event, id: '0000-out', movementType: MovementType.OUT, quantity: -1 }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'IN', quantity: 0, location: { type: 'WAREHOUSE', id: custody.id },
    });
    expect(transferFind).toHaveBeenCalledTimes(1);
  });

  it('does not show availability for ambiguous transfers even when IN has the greatest UUID', async () => {
    const event = { isOpeningBalance: false, refDocumentId: 'transfer', refDocumentType: DocumentType.PROVIDER_RECEIPT };
    const { service } = setup([asset({ ledger: [
      movement({ ...event, id: 'ffff-in', movementType: MovementType.IN }),
      movement({ ...event, id: '0001-in', movementType: MovementType.IN, warehouse: custody }),
      movement({ ...event, id: '0000-out', movementType: MovementType.OUT, warehouse: custody, quantity: -1 }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'UNKNOWN', quantity: 0, isAvailableInOwnerWarehouse: false,
      location: { type: 'UNKNOWN' },
    });
  });

  it('shows a legacy custody receipt whose IN timestamps are later than the OUT timestamps', async () => {
    const event = { isOpeningBalance: false, refDocumentId: 'receipt', refDocumentType: DocumentType.PROVIDER_RECEIPT };
    const later = new Date(registered.getTime() + 1);
    const { service, transferFind } = setup([asset({ ledger: [
      movement({ ...event, id: '0000-in', movementType: MovementType.IN, effectiveAt: later, createdAt: later }),
      movement({ ...event, id: 'ffff-out', movementType: MovementType.OUT, warehouse: custody, quantity: -1 }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'IN', quantity: 1, isAvailableInOwnerWarehouse: true,
      location: { type: 'WAREHOUSE', id: provider.id },
    });
    expect(transferFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ assetId: 'asset', refDocumentId: 'receipt' }] },
    }));
  });

  it('shows a single-IN provider receipt from transit as available without querying earlier documents', async () => {
    const { service, transferFind } = setup([asset({ ledger: [
      movement({ id: 'earlier-transit', isOpeningBalance: false, effectiveAt: delivered,
        movementType: MovementType.TRANSIT, warehouse: null, customerWorksite: site,
        refDocumentId: 'return-document', refDocumentType: DocumentType.RETURN }),
      movement({ id: 'receipt', isOpeningBalance: false, movementType: MovementType.IN,
        refDocumentId: 'provider-receipt', refDocumentType: DocumentType.PROVIDER_RECEIPT }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'IN', quantity: 1, isAvailableInOwnerWarehouse: true,
      location: { type: 'WAREHOUSE', id: provider.id },
    });
    // The head IN is also returned by this query and must not be counted twice.
    expect(transferFind).toHaveBeenCalledTimes(1);
    expect(transferFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ assetId: 'asset', refDocumentId: 'provider-receipt' }] },
    }));
  });

  it.each([
    ['an OUT effective after the IN', { effectiveAt: new Date(registered.getTime() + 1) }],
    ['an OUT registered after the IN', { createdAt: new Date(registered.getTime() + 1) }],
    ['another owner', { ownerWarehouseId: custody.id }],
    ['another document type', { refDocumentType: DocumentType.PROVIDER_PICKUP }],
    ['missing document type', { refDocumentType: null }],
  ])('keeps a receipt UNKNOWN when the same document has a counterpart with %s', async (_label, mismatch) => {
    const event = { isOpeningBalance: false, refDocumentId: 'receipt', refDocumentType: DocumentType.PROVIDER_RECEIPT };
    const { service, transferFind } = setup([asset({ ledger: [
      movement({ ...event, id: 'ffff-in', movementType: MovementType.IN }),
      movement({ ...event, id: '0000-out', movementType: MovementType.OUT, warehouse: custody,
        quantity: -1, ...mismatch }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'UNKNOWN', quantity: 0, location: { type: 'UNKNOWN' },
    });
    expect(transferFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ assetId: 'asset', refDocumentId: 'receipt' }] },
    }));
  });

  it.each([
    ['missing pickup source', { refDocumentType: DocumentType.PROVIDER_PICKUP }],
    ['non-owner receipt destination', { warehouse: custody }],
    ['receipt with origin worksite', { customerWorksite: site }],
    ['negative receipt quantity', { quantity: -1 }],
  ])('does not show availability for %s', async (_label, mismatch) => {
    const { service } = setup([asset({ ledger: [movement({
      isOpeningBalance: false, movementType: MovementType.IN,
      refDocumentId: 'provider-receipt', refDocumentType: DocumentType.PROVIDER_RECEIPT,
      ...mismatch,
    })] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'UNKNOWN', quantity: 0, isAvailableInOwnerWarehouse: false,
    });
  });

  it('resolves several latest provider documents in a single scoped query without crossing assets', async () => {
    const event = { isOpeningBalance: false, refDocumentId: 'shared-transfer', refDocumentType: DocumentType.PROVIDER_PICKUP };
    const { service, transferFind } = setup([
      asset({ ledger: [
        movement({ ...event, id: 'ffff-asset-out', movementType: MovementType.OUT, quantity: -1 }),
        movement({ ...event, id: '0000-asset-in', movementType: MovementType.IN, warehouse: custody }),
      ] }),
      asset({ id: 'second-asset', ledger: [
        movement({ ...event, id: 'ffff-second-out', movementType: MovementType.OUT, quantity: -1 }),
      ] }),
      asset({ id: 'unrelated', warehouseOwnerId: custody.id, ledger: [
        movement({ ...event, id: 'ffff-unrelated-in', movementType: MovementType.IN, warehouse: custody }),
      ] }),
    ]);
    const result = await service.getOwnerAssetCatalog(provider.id);
    expect(result.serial).toHaveLength(2);
    expect(result.serial.find((entry) => entry.assetId === 'asset')).toMatchObject({
      status: 'IN', location: { type: 'WAREHOUSE', id: custody.id },
    });
    expect(result.serial.find((entry) => entry.assetId === 'second-asset')).toMatchObject({
      status: 'UNKNOWN', quantity: 0,
    });
    expect(transferFind).toHaveBeenCalledTimes(1);
    expect(transferFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [
        { assetId: 'asset', refDocumentId: 'shared-transfer' },
        { assetId: 'second-asset', refDocumentId: 'shared-transfer' },
      ] },
    }));
  });

  it('does not fetch a previous provider transfer after a newer real dispatch', async () => {
    const { service, transferFind } = setup([asset({ ledger: [
      movement({ id: 'receipt', isOpeningBalance: false, effectiveAt: delivered,
        movementType: MovementType.IN, refDocumentId: 'receipt', refDocumentType: DocumentType.PROVIDER_RECEIPT }),
      movement({ id: 'new-dispatch', isOpeningBalance: false, movementType: MovementType.OUT,
        quantity: -1, customerWorksite: site, refDocumentId: 'remission', refDocumentType: DocumentType.REMISSION }),
    ] })]);
    expect((await service.getOwnerAssetCatalog(provider.id)).serial[0]).toMatchObject({
      status: 'OUT', quantity: 0, location: { type: 'WORKSITE', id: site.id },
    });
    expect(transferFind).not.toHaveBeenCalled();
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
