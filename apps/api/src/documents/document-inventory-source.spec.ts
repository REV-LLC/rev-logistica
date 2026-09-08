import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  InventorySourceMode,
  Prisma,
  Role,
} from '@prisma/client';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { resolveDocumentInventorySourceMode } from './document-inventory-source';
import { DocumentsService } from './documents.service';
import { AutosaveDocumentRequestDto } from './dto/autosave-document-request.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto';
import { UpdateDocumentRequestDto } from './dto/update-document-request.dto';

const WAREHOUSE = InventorySourceMode.WAREHOUSE;
const OWNER_WAREHOUSES = InventorySourceMode.OWNER_WAREHOUSES;
const baseItem = {
  skuId: 'bulk-sku',
  assetId: null,
  componentParentAssetId: null,
  quantity: new Prisma.Decimal(1),
  condition: 'provider-warehouse',
  requestedTag: null,
};

function fixture(overrides: Record<string, unknown> = {}) {
  const document = {
    id: 'document-1',
    type: DocumentType.REMISSION,
    status: DocumentStatus.DRAFT,
    consecutive: 'RM009186',
    createdBy: 'user-1',
    warehouseId: 'our-warehouse',
    inventorySourceMode: WAREHOUSE as InventorySourceMode | null,
    customerWorksiteId: 'worksite-1',
    docDate: new Date('2026-09-08T12:00:00Z'),
    notes: 'Entrega: ON_SITE',
    recipientPhone: null,
    recipientPhones: [],
    items: [baseItem],
    files: [],
    _count: { items: 1 },
    ...overrides,
  };
  const database = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    document: {
      findUnique: jest.fn().mockResolvedValue(document),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        ...data,
        id: 'created-document',
      })),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        ...document,
        ...data,
      })),
    },
    documentItem: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    fileObject: { create: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    sku: { findMany: jest.fn().mockResolvedValue([
      { id: 'bulk-sku', assetFamily: { controlType: 'BULK' } },
    ]) },
    asset: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: {
      findFirst: jest.fn().mockResolvedValue({ id: 'our-warehouse', type: 'OWN' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    ...database,
    $transaction: jest.fn(async (fn: (tx: typeof database) => unknown) => fn(database)),
  };
  const inventory = {
    moveOut: jest.fn(),
    moveOnSite: jest.fn(),
    moveIn: jest.fn(),
    moveReturnTransit: jest.fn(),
    invalidateDocumentMovementCaches: jest.fn().mockResolvedValue(undefined),
  };
  const snapshots = { refresh: jest.fn() };
  const messages = { sendDraft: jest.fn() };
  const emails = { sendFinalIfNeeded: jest.fn().mockResolvedValue(undefined) };
  const service = new DocumentsService(
    prisma as never,
    inventory as never,
    emails as never,
    messages as never,
    snapshots as never,
  );
  return { document, prisma, database, inventory, service };
}

describe('Document physical inventory origin', () => {
  it.each([
    [WAREHOUSE, 'Entrega: ON_SITE', WAREHOUSE],
    [OWNER_WAREHOUSES, 'Entrega: WAREHOUSE', OWNER_WAREHOUSES],
    [null, 'Entrega: ON_SITE', OWNER_WAREHOUSES],
    [undefined, 'Fecha: 2026-09-02 | entrega: on_site | Conductor: x', OWNER_WAREHOUSES],
    [null, 'Entrega: WAREHOUSE', WAREHOUSE],
    [null, null, WAREHOUSE],
  ])('resolves %s with notes %s as %s', (inventorySourceMode, notes, expected) => {
    expect(resolveDocumentInventorySourceMode({ inventorySourceMode, notes })).toBe(expected);
  });

  it.each(['Entrega: ON_SITE', 'Entrega: WAREHOUSE'])('dispatches from our custody independently of %s', async (notes) => {
    const { service, document, inventory, database } = fixture({ notes });
    await service['approveLoadedRequestDocument'](document, 'office-1');
    expect(inventory.moveOut).toHaveBeenCalledWith({
      warehouseId: 'our-warehouse',
      customerWorksiteId: 'worksite-1',
      documentId: 'document-1',
      items: [{ skuId: 'bulk-sku', quantity: 1, ownerWarehouseId: 'provider-warehouse' }],
    }, 'office-1', database);
    expect(inventory.moveOnSite).not.toHaveBeenCalled();
  });

  it('uses each owner warehouse for an explicitly direct provider dispatch', async () => {
    const { service, document, inventory, database } = fixture({
      inventorySourceMode: OWNER_WAREHOUSES,
      warehouseId: null,
      notes: 'Entrega: WAREHOUSE',
    });
    await service['approveLoadedRequestDocument'](document, 'office-1');
    expect(inventory.moveOnSite).toHaveBeenCalledWith({
      customerWorksiteId: 'worksite-1',
      documentId: 'document-1',
      items: [{ skuId: 'bulk-sku', quantity: 1, ownerWarehouseId: 'provider-warehouse' }],
    }, 'office-1', database);
    expect(inventory.moveOut).not.toHaveBeenCalled();
  });

  it.each([
    ['Entrega: ON_SITE', 'moveOnSite'],
    ['Entrega: WAREHOUSE', 'moveOut'],
  ])('retains legacy approval routing for %s', async (notes, method) => {
    const { service, document, inventory } = fixture({ inventorySourceMode: null, notes });
    await service['approveLoadedRequestDocument'](document, 'office-1');
    expect(inventory[method as 'moveOut' | 'moveOnSite']).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret returns using a remission origin', async () => {
    const { service, document, inventory } = fixture({
      type: DocumentType.RETURN,
      inventorySourceMode: OWNER_WAREHOUSES,
    });
    await service['approveLoadedRequestDocument'](document, 'office-1');
    expect(inventory.moveIn).toHaveBeenCalledTimes(1);
    expect(inventory.moveOnSite).not.toHaveBeenCalled();
    expect(inventory.moveOut).not.toHaveBeenCalled();
  });

  it('keeps physical location failures blocking and does not confirm after them', async () => {
    const { service, document, inventory, database } = fixture();
    const failure = new BadRequestException('MEZCLADORA #3 no está en Bodega Principal');
    inventory.moveOut.mockRejectedValue(failure);
    await expect(service['approveLoadedRequestDocument'](document, 'office-1')).rejects.toBe(failure);
    expect(database.document.update).not.toHaveBeenCalled();
    expect(inventory.moveOnSite).not.toHaveBeenCalled();
  });

  it('loads and honors the persisted origin through the public approval method', async () => {
    const { service, inventory } = fixture();
    await expect(service.approveRequestDocument('document-1', 'office-1')).resolves.toMatchObject({
      status: DocumentStatus.CONFIRMED,
    });
    expect(inventory.moveOut).toHaveBeenCalledTimes(1);
    expect(inventory.moveOnSite).not.toHaveBeenCalled();
  });

  it('requires the explicitly selected warehouse before approval', async () => {
    const { service, document, inventory } = fixture({ warehouseId: null });
    await expect(service['approveLoadedRequestDocument'](document, 'office-1')).rejects.toThrow(
      'Selecciona la bodega desde donde sale físicamente el equipo',
    );
    expect(inventory.moveOut).not.toHaveBeenCalled();
  });

  it('reloads the current draft items and origin after locking the document', async () => {
    const { service, document, inventory, database } = fixture();
    database.document.findUnique.mockResolvedValueOnce({ ...document,
      inventorySourceMode: OWNER_WAREHOUSES, warehouseId: null,
      items: [{ ...baseItem, quantity: new Prisma.Decimal(3) }],
    });
    await service['approveLoadedRequestDocument'](document, 'office-1');
    expect(database.$queryRaw.mock.calls[0][0].sql).toContain('FROM "Document"');
    expect(database.$queryRaw.mock.calls[0][0].values).toEqual([document.id]);
    expect(database.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(database.document.findUnique.mock.invocationCallOrder[0]);
    expect(inventory.moveOnSite).toHaveBeenCalledWith({ documentId: document.id,
      customerWorksiteId: 'worksite-1',
      items: [{ skuId: 'bulk-sku', quantity: 3, ownerWarehouseId: 'provider-warehouse' }],
    }, 'office-1', database);
    expect(inventory.moveOut).not.toHaveBeenCalled();
  });

  it('rejects a draft already confirmed by another operator under the transaction lock', async () => {
    const { service, document, inventory, database } = fixture();
    database.document.findUnique.mockResolvedValueOnce({ ...document, status: DocumentStatus.CONFIRMED });
    await expect(service['approveLoadedRequestDocument'](document, 'office-1'))
      .rejects.toThrow('Solo se puede aprobar un documento en estado DRAFT');
    expect(inventory.moveOut).not.toHaveBeenCalled();
    expect(inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
  });

  it('rechecks the currently linked provider evidence before writing any movement', async () => {
    const { service, document, inventory, database } = fixture();
    database.warehouse.findMany.mockResolvedValueOnce([{ id: 'provider-warehouse', name: 'Proveedor' }] as never);
    await expect(service['approveLoadedRequestDocument'](document, 'office-1'))
      .rejects.toMatchObject({ response: { code: 'PROVIDER_REMISSION_REQUIRED' } });
    expect(inventory.moveOut).not.toHaveBeenCalled();
    expect(database.document.update).not.toHaveBeenCalled();
  });

  it('propagates a status-write failure after a valid movement to the same outer transaction', async () => {
    const { service, document, inventory, database, prisma } = fixture();
    const failure = new Error('synthetic status write failure');
    database.document.update.mockRejectedValueOnce(failure);
    await expect(service['approveLoadedRequestDocument'](document, 'office-1')).rejects.toBe(failure);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(inventory.moveOut.mock.calls[0][2]).toBe(database);
    expect(inventory.moveOut.mock.invocationCallOrder[0]).toBeLessThan(database.document.update.mock.invocationCallOrder[0]);
    expect(inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
  });

  it('keeps return billing cutoffs and confirmation in the same transaction as receipt', async () => {
    const { service, document, inventory, database } = fixture({ type: DocumentType.RETURN });
    await service['approveLoadedRequestDocument'](document, 'office-1');
    expect(inventory.moveIn.mock.calls[0][2]).toBe(database);
    expect(database.documentItem.updateMany).toHaveBeenCalledWith({
      where: { documentId: document.id, billingCutoffDate: null },
      data: { billingCutoffDate: document.docDate, billingStatus: 'CUT' },
    });
    expect(inventory.moveIn.mock.invocationCallOrder[0]).toBeLessThan(database.documentItem.updateMany.mock.invocationCallOrder[0]);
    expect(database.documentItem.updateMany.mock.invocationCallOrder[0]).toBeLessThan(database.document.update.mock.invocationCallOrder[0]);
    expect(database.document.update.mock.invocationCallOrder[0])
      .toBeLessThan(inventory.invalidateDocumentMovementCaches.mock.invocationCallOrder[0]);
  });

  it('rolls a return approval back when billing cutoff update fails after receipt', async () => {
    const { service, document, inventory, database } = fixture({ type: DocumentType.RETURN });
    const failure = new Error('synthetic billing write failure');
    database.documentItem.updateMany.mockRejectedValueOnce(failure);
    await expect(service['approveLoadedRequestDocument'](document, 'office-1')).rejects.toBe(failure);
    expect(inventory.moveIn).toHaveBeenCalledTimes(1);
    expect(database.document.update).not.toHaveBeenCalled();
    expect(inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
  });

  it.each(['P2034', '40001', '40P01'])('retries %s conflicts using a fresh locked read without leaking caches', async (code) => {
    const { service, document, inventory, database, prisma } = fixture();
    database.document.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('serialization', {
      code: code === 'P2034' ? code : 'P2010', meta: { code }, clientVersion: 'test',
    }));
    await expect(service['approveLoadedRequestDocument'](document, 'office-1')).resolves.toMatchObject({ status: DocumentStatus.CONFIRMED });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(database.document.findUnique).toHaveBeenCalledTimes(2);
    expect(database.$queryRaw).toHaveBeenCalledTimes(2);
    expect(inventory.invalidateDocumentMovementCaches).toHaveBeenCalledTimes(1);
  });

  it.each(['P2034', '40001', '40P01'])('returns readable conflict after three %s failures without side effects outside the transaction', async (code) => {
    const { service, document, inventory, database, prisma } = fixture();
    database.document.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('serialization', {
      code: code === 'P2034' ? code : 'P2010', meta: { code }, clientVersion: 'test',
    }));
    await expect(service['approveLoadedRequestDocument'](document, 'office-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
  });

  it.each([
    [WAREHOUSE, 'our-warehouse'],
    [OWNER_WAREHOUSES, 'provider-warehouse'],
  ])('resolves serialized SKU identity within %s physical source without changing owner', async (mode, physicalWarehouse) => {
    const { service, database } = fixture();
    database.sku.findMany.mockResolvedValue([
      { id: 'serial-sku', assetFamily: { controlType: 'SERIAL' } },
    ]);
    database.asset.findMany.mockResolvedValue([
      { id: 'mixer-3', internalNumber: 3, serialOrEngine: null },
    ] as never);
    const items = await service['mapDocumentItemsToMovementItems']([
      { ...baseItem, skuId: 'serial-sku', requestedTag: 'MEZCLADORA #3' },
    ], { mode, warehouseId: 'our-warehouse' });
    expect(database.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        skuId: 'serial-sku',
        warehouseOwnerId: 'provider-warehouse',
        warehouseCurrentId: physicalWarehouse,
        active: true,
        deletedAt: null,
      },
    }));
    expect(items).toEqual([{ assetId: 'mixer-3', ownerWarehouseId: 'provider-warehouse' }]);
  });

  it('never substitutes another serialized unit when the requested identity is absent', async () => {
    const { service, database } = fixture();
    database.sku.findMany.mockResolvedValue([
      { id: 'serial-sku', assetFamily: { controlType: 'SERIAL' } },
    ]);
    database.asset.findMany.mockResolvedValue([
      { id: 'mixer-4', internalNumber: 4, serialOrEngine: null },
    ] as never);
    await expect(service['mapDocumentItemsToMovementItems']([
      { ...baseItem, skuId: 'serial-sku', requestedTag: 'MEZCLADORA #3' },
    ], { mode: WAREHOUSE, warehouseId: 'our-warehouse' })).rejects.toThrow('pidió #3');
  });

  it('persists explicit origin on request creation without overwriting delivery notes', async () => {
    const { service, database } = fixture();
    await service.createRequestDocument({
      type: DocumentType.REMISSION,
      inventorySourceMode: WAREHOUSE,
      warehouseId: 'our-warehouse',
      notes: 'Entrega: ON_SITE',
      createdBy: 'user-1',
      sendWhatsapp: false,
      items: [{ assetId: 'mixer-3', ownerWarehouseId: 'provider-warehouse' }],
    });
    expect(database.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inventorySourceMode: WAREHOUSE,
        warehouseId: 'our-warehouse',
        notes: 'Entrega: ON_SITE',
      }),
    }));
  });

  it('rejects a completed warehouse-origin request with no source warehouse before persisting it', async () => {
    const { service, database } = fixture();
    await expect(service.createRequestDocument({
      type: DocumentType.REMISSION,
      inventorySourceMode: WAREHOUSE,
      notes: 'Entrega: ON_SITE',
      createdBy: 'user-1',
      sendWhatsapp: false,
      items: [{ assetId: 'mixer-3', ownerWarehouseId: 'provider-warehouse' }],
    })).rejects.toThrow('Selecciona la bodega desde donde sale físicamente el equipo');
    expect(database.document.create).not.toHaveBeenCalled();
  });

  it('leaves origin null for older clients that omit it instead of backfilling a new meaning', async () => {
    const { service, database } = fixture();
    await service.createRequestDocument({
      type: DocumentType.REMISSION,
      notes: 'Entrega: ON_SITE',
      createdBy: 'user-1',
      sendWhatsapp: false,
      items: [{ assetId: 'mixer-3', ownerWarehouseId: 'provider-warehouse' }],
    });
    expect(database.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: null, notes: 'Entrega: ON_SITE' }),
    }));
  });

  it('preserves explicit origin through generic document creation too', async () => {
    const { service, database } = fixture();
    await service.createDocument({
      type: DocumentType.REMISSION,
      inventorySourceMode: OWNER_WAREHOUSES,
      recipientPhones: ['3001234567'],
      createdBy: 'user-1',
    });
    expect(database.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: OWNER_WAREHOUSES }),
    }));
  });

  it.each([DocumentType.REMISSION, DocumentType.RETURN])(
    'uses the supplied business date for generic %s instead of its registration date',
    async (type) => {
      const { service, database } = fixture();
      await service.createDocument({
        type,
        status: DocumentStatus.CONFIRMED,
        warehouseId: 'our-warehouse',
        inventorySourceMode: WAREHOUSE,
        notes: 'Entrega: ON_SITE | Fecha documento: 2026-08-17',
        recipientPhones: ['3001234567'],
        createdBy: 'user-1',
      });
      expect(database.document.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          docDate: new Date('2026-08-17T12:00:00.000Z'),
          inventorySourceMode: WAREHOUSE,
          notes: 'Entrega: ON_SITE | Fecha documento: 2026-08-17',
        }),
      }));
    },
  );

  it('rejects missing explicit physical origin on generic remission before creating a document', async () => {
    const { service, database } = fixture();
    await expect(service.createDocument({
      type: DocumentType.REMISSION,
      inventorySourceMode: WAREHOUSE,
      createdBy: 'user-1',
    })).rejects.toThrow('Selecciona la bodega desde donde sale físicamente el equipo');
    expect(database.document.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid generic document date before creating a document', async () => {
    const { service, database } = fixture();
    await expect(service.createDocument({
      type: DocumentType.RETURN,
      notes: 'Fecha documento: no-es-una-fecha',
      createdBy: 'user-1',
    })).rejects.toThrow('Fecha documento inválida');
    expect(database.document.create).not.toHaveBeenCalled();
  });

  it('retains registration date and null origin for generic clients without either field', async () => {
    const { service, database } = fixture();
    const before = Date.now();
    await service.createDocument({
      type: DocumentType.REMISSION,
      createdBy: 'user-1',
      recipientPhones: ['3001234567'],
    });
    const { data } = database.document.create.mock.calls[0][0];
    expect(data.inventorySourceMode).toBeNull();
    expect(data.docDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.docDate.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('allows empty autosaves but requires their explicit source before submission', async () => {
    const { service, database } = fixture({
      status: DocumentStatus.IN_PROGRESS,
      warehouseId: null,
    });
    await service.createAutosavedRequestDocument({
      type: DocumentType.REMISSION,
      inventorySourceMode: WAREHOUSE,
      createdBy: 'user-1',
      items: [],
    });
    expect(database.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ warehouseId: null, inventorySourceMode: WAREHOUSE }),
    }));
    await expect(service.submitAutosavedRequestDocument(
      'document-1', { sendWhatsapp: false }, { sub: 'user-1', role: Role.ADMIN },
    )).rejects.toThrow('Selecciona la bodega desde donde sale físicamente el equipo');
    expect(database.document.update).not.toHaveBeenCalled();
  });

  it('persists and preserves origin across autosave reloads and unrelated edits', async () => {
    const { service, database } = fixture({ status: DocumentStatus.IN_PROGRESS });
    await service.updateAutosavedRequestDocument('document-1', {
      type: DocumentType.REMISSION,
      inventorySourceMode: OWNER_WAREHOUSES,
      items: [],
    }, { sub: 'user-1', role: Role.ADMIN });
    expect(database.document.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: OWNER_WAREHOUSES }),
    }));
    await service.updateAutosavedRequestDocument('document-1', {
      type: DocumentType.REMISSION,
      notes: 'Entrega: WAREHOUSE',
    }, { sub: 'user-1', role: Role.ADMIN });
    expect(database.document.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: WAREHOUSE }),
    }));
    expect(database.document.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ inventorySourceMode: true }),
    }));
  });

  it('updates the selected origin on a submitted draft and preserves it when omitted', async () => {
    const { service, database } = fixture();
    await service.updateRequestDocument('document-1', {
      inventorySourceMode: OWNER_WAREHOUSES,
      items: [],
    }, 'office-1');
    expect(database.document.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: OWNER_WAREHOUSES }),
    }));
    await service.updateRequestDocument('document-1', { notes: 'Entrega: ON_SITE', items: [] }, 'office-1');
    expect(database.document.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: WAREHOUSE }),
    }));
  });

  it('does not clear a required warehouse using an optional null payload', async () => {
    const { service, database } = fixture();
    await expect(service.updateRequestDocument('document-1', {
      warehouseId: null,
      items: [],
    } as never, 'office-1')).rejects.toThrow('Selecciona la bodega desde donde sale físicamente el equipo');
    expect(database.document.update).not.toHaveBeenCalled();
  });

  it('keeps a legacy draft legacy during an unrelated office edit', async () => {
    const { service, database } = fixture({ inventorySourceMode: null });
    await service.updateRequestDocument('document-1', { items: [] }, 'office-1');
    expect(database.document.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventorySourceMode: null }),
    }));
  });

  it('copies the origin to every document produced by splitting a long remission', async () => {
    const { service, document, database } = fixture({
      items: Array.from({ length: 21 }, (_, index) => ({ ...baseItem, id: `item-${index}` })),
    });
    await service['splitRemissionDraftDocument'](document as never);
    expect(database.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inventorySourceMode: WAREHOUSE,
        warehouseId: 'our-warehouse',
        notes: 'Entrega: ON_SITE',
      }),
    }));
  });

  it('includes the persisted source in list payloads', async () => {
    const { service, database } = fixture();
    await service.listDocuments({ userId: 'office-1', role: Role.ADMIN });
    expect(database.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ inventorySourceMode: true }),
    }));
  });

  it.each([
    CreateDocumentDto,
    CreateDocumentRequestDto,
    UpdateDocumentRequestDto,
    AutosaveDocumentRequestDto,
  ])('validates the two physical source values independently from delivery mode in %p', async (Dto) => {
    for (const inventorySourceMode of [WAREHOUSE, OWNER_WAREHOUSES, undefined]) {
      const dto = plainToInstance(Dto as ClassConstructor<object>, { inventorySourceMode });
      expect((await validate(dto)).filter((error) => error.property === 'inventorySourceMode')).toEqual([]);
    }
    const invalid = plainToInstance(Dto as ClassConstructor<object>, { inventorySourceMode: 'ON_SITE' });
    expect((await validate(invalid)).find((error) => error.property === 'inventorySourceMode')).toBeDefined();
  });
});
