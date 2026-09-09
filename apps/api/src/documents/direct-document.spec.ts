import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DocumentStatus, DocumentType, InventorySourceMode, Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { CreateDirectDocumentDto } from './dto/create-direct-document.dto';

const own = '10000000-0000-4000-8000-000000000001';
const provider = '10000000-0000-4000-8000-000000000002';
const asset = '10000000-0000-4000-8000-000000000003';
const otherAsset = '10000000-0000-4000-8000-000000000004';
const sku = '10000000-0000-4000-8000-000000000005';
const site = '10000000-0000-4000-8000-000000000006';
const item = { assetId: asset, ownerWarehouseId: provider };

function payload(overrides: Partial<CreateDirectDocumentDto> = {}): CreateDirectDocumentDto {
  return {
    type: DocumentType.REMISSION,
    status: DocumentStatus.CONFIRMED,
    inventorySourceMode: InventorySourceMode.WAREHOUSE,
    warehouseId: own,
    customerWorksiteId: site,
    recipientPhone: '3001234567',
    notes: 'Fecha documento: 2026-08-17 | Entrega: REMISSION',
    items: [item],
    ...overrides,
  };
}

function setup() {
  const sequence: string[] = [];
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    warehouse: {
      findMany: jest.fn().mockImplementation(async ({ where }) => [
        { id: own, type: 'OWN' }, { id: provider, type: 'ALLY' },
      ].filter((row) => where.id.in.includes(row.id))),
      findFirst: jest.fn().mockResolvedValue({ id: own, type: 'OWN' }),
    },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }) => {
        sequence.push('document');
        return { id: 'created-doc', ...data };
      }),
    },
    documentItem: { createMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>, _options?: {
      isolationLevel: Prisma.TransactionIsolationLevel; maxWait: number; timeout: number;
    }) => {
      sequence.push('begin');
      try {
        const result = await run(tx);
        sequence.push('commit');
        return result;
      } catch (error) {
        sequence.push('rollback');
        throw error;
      }
    }),
  };
  const inventory = {
    moveOut: jest.fn().mockImplementation(async () => sequence.push('out')),
    moveOnSite: jest.fn().mockImplementation(async () => sequence.push('on-site')),
    moveIn: jest.fn().mockImplementation(async () => sequence.push('in')),
    moveReturnTransit: jest.fn().mockImplementation(async () => sequence.push('transit')),
    invalidateDocumentMovementCaches: jest.fn().mockImplementation(async () => sequence.push('cache')),
  };
  const emails = { sendFinalIfNeeded: jest.fn() };
  const messages = { sendDraft: jest.fn(), sendFinal: jest.fn() };
  const snapshots = { refresh: jest.fn() };
  const service = new DocumentsService(prisma as never, inventory as never, emails as never,
    messages as never, snapshots as never);
  return { tx, prisma, inventory, emails, messages, snapshots, service, sequence };
}

describe('Atomic direct documents', () => {
  it.each([
    [InventorySourceMode.WAREHOUSE, 'REMISSION', 'moveOut'],
    [InventorySourceMode.WAREHOUSE, 'ON_SITE', 'moveOut'],
    [InventorySourceMode.OWNER_WAREHOUSES, 'REMISSION', 'moveOnSite'],
    [InventorySourceMode.OWNER_WAREHOUSES, 'ON_SITE', 'moveOnSite'],
  ] as const)('uses physical origin %s independently of delivery %s', async (source, delivery, writer) => {
    const f = setup();
    const input = payload({ inventorySourceMode: source,
      notes: `Fecha documento: 2026-08-17 | Entrega: ${delivery}` });
    const result = await f.service.createDirectDocument(input, 'operator');
    expect(result.status).toBe(DocumentStatus.CONFIRMED);
    expect(result.docDate.toISOString()).toBe('2026-08-17T12:00:00.000Z');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.prisma.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000,
    });
    expect(f.inventory[writer]).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'created-doc', customerWorksiteId: site, items: [item],
    }), 'operator', f.tx);
    expect(f.inventory[writer === 'moveOut' ? 'moveOnSite' : 'moveOut']).not.toHaveBeenCalled();
    expect(f.tx.documentItem.createMany).not.toHaveBeenCalled();
    expect(f.tx.document.create.mock.calls[0][0].data).not.toHaveProperty('items');
    expect(f.sequence.at(-2)).toBe('commit');
    expect(f.sequence.at(-1)).toBe('cache');
    expect(f.inventory.invalidateDocumentMovementCaches).toHaveBeenCalledWith([provider, own], site);
    expect(f.messages.sendDraft).not.toHaveBeenCalled();
    expect(f.messages.sendFinal).not.toHaveBeenCalled();
    expect(f.emails.sendFinalIfNeeded).not.toHaveBeenCalled();
    expect(f.snapshots.refresh).not.toHaveBeenCalled();
  });

  it('performs provider transit and own receipt in one transaction for a mixed return', async () => {
    const f = setup();
    const ownItem = { assetId: otherAsset, ownerWarehouseId: own };
    await f.service.createDirectDocument(payload({ type: DocumentType.RETURN,
      inventorySourceMode: undefined, items: [item, ownItem] }), 'operator');
    expect(f.inventory.moveReturnTransit).toHaveBeenCalledWith({
      documentId: 'created-doc', customerWorksiteId: site, items: [item],
    }, 'operator', f.tx);
    expect(f.inventory.moveIn).toHaveBeenCalledWith({
      documentId: 'created-doc', customerWorksiteId: site, warehouseId: own, items: [ownItem],
    }, 'operator', f.tx);
    expect(f.sequence).toEqual(['begin', 'document', 'transit', 'in', 'commit', 'cache']);
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates a second movement failure to the outer transaction without flushing caches', async () => {
    const f = setup();
    const failure = new BadRequestException('El equipo propio no está en esta obra');
    f.inventory.moveIn.mockRejectedValueOnce(failure);
    await expect(f.service.createDirectDocument(payload({ type: DocumentType.RETURN,
      inventorySourceMode: undefined, items: [item, { assetId: otherAsset, ownerWarehouseId: own }] }), 'operator'))
      .rejects.toBe(failure);
    expect(f.sequence).toEqual(['begin', 'document', 'transit', 'rollback']);
    expect(f.inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('allows a provider-only return without a receiving own warehouse', async () => {
    const f = setup();
    await f.service.createDirectDocument(payload({ type: DocumentType.RETURN,
      inventorySourceMode: undefined, warehouseId: undefined }), 'operator');
    expect(f.inventory.moveReturnTransit).toHaveBeenCalledTimes(1);
    expect(f.inventory.moveIn).not.toHaveBeenCalled();
    expect(f.tx.warehouse.findFirst).not.toHaveBeenCalled();
  });

  it('locks all quantity SKUs before all serialized assets for a mixed return', async () => {
    const f = setup();
    await f.service.createDirectDocument(payload({ type: DocumentType.RETURN,
      inventorySourceMode: undefined,
      items: [item, { skuId: sku, ownerWarehouseId: own, quantity: 2 }] }), 'operator');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(f.tx.$queryRaw.mock.calls[0][0].sql).toContain('FROM "Sku"');
    expect(f.tx.$queryRaw.mock.calls[1][0].sql).toContain('FROM "Asset"');
    expect(f.tx.$queryRaw.mock.calls[0][0].values).toEqual([sku]);
    expect(f.tx.$queryRaw.mock.calls[1][0].values).toEqual([asset]);
  });

  it.each([
    { inventorySourceMode: undefined },
    { inventorySourceMode: InventorySourceMode.WAREHOUSE, warehouseId: undefined },
    { type: DocumentType.PROVIDER_PICKUP },
    { status: DocumentStatus.DRAFT },
    { customerWorksiteId: '' },
    { items: [] },
    { items: [{ ownerWarehouseId: provider }] },
    { items: [{ ...item, skuId: sku, quantity: 1 }] },
    { items: [{ ...item, quantity: 2 }] },
    { items: [{ skuId: sku, ownerWarehouseId: own, quantity: 0 }] },
    { items: [{ skuId: sku, ownerWarehouseId: own, quantity: Number.NaN }] },
    { items: [item, item] },
  ])('rejects malformed direct input before opening a transaction: %j', async (changes) => {
    const f = setup();
    await expect(f.service.createDirectDocument(payload(changes), 'operator')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['owner', 'source', 'own-return'])('rejects invalid %s warehouse before creating a document', async (kind) => {
    const f = setup();
    if (kind === 'owner') f.tx.warehouse.findMany.mockResolvedValueOnce([]);
    else f.tx.warehouse.findFirst.mockResolvedValueOnce(kind === 'source' ? null : { id: provider, type: 'ALLY' });
    const changes = kind === 'own-return' ? { type: DocumentType.RETURN, inventorySourceMode: undefined,
      items: [{ assetId: otherAsset, ownerWarehouseId: own }] } : {};
    await expect(f.service.createDirectDocument(payload(changes), 'operator')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.tx.document.create).not.toHaveBeenCalled();
    expect(f.inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
  });

  it.each(['P2034', '40001', '40P01'])('retries %s failures with the same explicit number, payload and document date', async (code) => {
    const f = setup();
    const conflict = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: code === 'P2034' ? code : 'P2010', meta: { code }, clientVersion: 'test',
    });
    f.inventory.moveOut.mockRejectedValueOnce(conflict);
    const input = payload({ number: '942001' });
    await f.service.createDirectDocument(input, 'operator');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(f.inventory.invalidateDocumentMovementCaches).toHaveBeenCalledTimes(1);
    const firstData = f.tx.document.create.mock.calls[0][0].data;
    expect(f.tx.document.create.mock.calls[1][0].data).toEqual(firstData);
    expect(f.sequence).toEqual(['begin', 'document', 'rollback', 'begin', 'document', 'out', 'commit', 'cache']);
  });

  it.each(['P2034', '40001', '40P01'])('returns a readable 409 after three %s failures and never flushes caches', async (code) => {
    const f = setup();
    f.inventory.moveOut.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: code === 'P2034' ? code : 'P2010', meta: { code }, clientVersion: 'test',
    }));
    await expect(f.service.createDirectDocument(payload(), 'operator')).rejects.toBeInstanceOf(ConflictException);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(f.inventory.invalidateDocumentMovementCaches).not.toHaveBeenCalled();
  });

  it('returns committed success if only cache invalidation fails', async () => {
    const f = setup();
    f.inventory.invalidateDocumentMovementCaches.mockRejectedValueOnce(new Error('cache down'));
    await expect(f.service.createDirectDocument(payload(), 'operator')).resolves.toMatchObject({ id: 'created-doc' });
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit consecutive conflicts readable without retrying movements', async () => {
    const f = setup();
    f.tx.document.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['consecutive'] },
    }));
    await expect(f.service.createDirectDocument(payload({ number: '1' }), 'operator'))
      .rejects.toThrow('El consecutivo ya existe');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.inventory.moveOut).not.toHaveBeenCalled();
  });
});

describe('Direct document HTTP contract', () => {
  it.each([
    {},
    { items: [{ skuId: sku, ownerWarehouseId: own, quantity: 2 }] },
    { type: DocumentType.RETURN, inventorySourceMode: undefined, warehouseId: undefined },
  ])('accepts valid serial/bulk/remission/return input %j', async (changes) => {
    expect(await validate(plainToInstance(CreateDirectDocumentDto, payload(changes)))).toEqual([]);
  });

  it.each([
    { type: DocumentType.PROVIDER_PICKUP },
    { status: DocumentStatus.DRAFT },
    { inventorySourceMode: undefined },
    { inventorySourceMode: 'bad-source' },
    { customerWorksiteId: 'not-a-uuid' },
    { items: [] },
    { items: [{ ownerWarehouseId: provider }] },
    { items: [{ ...item, skuId: sku, quantity: 1 }] },
    { items: [{ ...item, quantity: 2 }] },
    { items: [{ ...item, ownerWarehouseId: undefined }] },
    { items: [{ skuId: sku, ownerWarehouseId: own }] },
    { items: [{ skuId: sku, ownerWarehouseId: own, quantity: -1 }] },
  ])('validates the direct DTO before service invocation: %j', async (changes) => {
    const instance = plainToInstance(CreateDirectDocumentDto, { ...payload(), ...changes });
    expect((await validate(instance)).length).toBeGreaterThan(0);
  });

  it('uses the authenticated operator and distinct idempotency scope, restricted to office/admin', async () => {
    const service = { createDirectDocument: jest.fn().mockResolvedValue({ id: 'doc' }) };
    const idempotency = { execute: jest.fn().mockImplementation(({ run }) => run()) };
    const controller = new DocumentsController(service as never, idempotency as never);
    const input = payload();
    await expect(controller.createDirectDocument(input, { user: { sub: 'operator' } } as never, 'repeat-key'))
      .resolves.toEqual({ id: 'doc' });
    expect(service.createDirectDocument).toHaveBeenCalledWith(input, 'operator');
    expect(idempotency.execute).toHaveBeenCalledWith(expect.objectContaining({
      key: 'repeat-key', userId: 'operator', operation: 'documents.direct.create',
    }));
    expect(Reflect.getMetadata(PATH_METADATA, controller.createDirectDocument)).toBe('direct');
    expect(Reflect.getMetadata('roles', controller.createDirectDocument)).toEqual([Role.ADMIN, Role.OFFICE]);
  });
});
