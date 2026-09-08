import { DocumentType, MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('readable serialized movement errors', () => {
  const assetId = 'cbcd1453-c8f2-4041-9ebf-4ff3ca292684';
  const originId = '8941f5b2-56eb-4ecf-899e-7386bac0b04d';
  const ownerId = '3d297ba3-ff9c-4020-823d-861f7a869d9d';
  const docDate = new Date('2026-09-03T12:00:00.000Z');

  function setup() {
    const latest = {
      id: 'opening-ledger', ownerWarehouseId: ownerId,
      assetId, movementType: MovementType.ADJUST, warehouseId: ownerId,
      customerWorksiteId: null, effectiveAt: new Date('2026-09-08T13:34:28.026Z'),
      createdAt: new Date('2026-09-08T13:34:28.026Z'), refDocumentId: null, refDocumentType: null,
      isOpeningBalance: true, quantity: 1,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue({ type: DocumentType.REMISSION, docDate }) },
      warehouse: { findUnique: jest.fn(async ({ where }) => ({
        id: where.id, name: where.id === ownerId ? 'TECNIREPARACIONES' : 'Bodega Principal de Alquiler',
      })) },
      customerWorksite: { findUnique: jest.fn().mockResolvedValue({
        id: 'worksite', alias: 'CASA DE LOS ANDAMIOS', worksite: { name: 'CASA DE LOS ANDAMIOS' },
      }) },
      asset: { findMany: jest.fn().mockResolvedValue([{
        id: assetId, description: 'MEZCLADORA', internalNumber: 3, warehouseOwnerId: ownerId,
        sku: { name: 'MEZCLADORA' }, warehouseOwner: { name: 'TECNIREPARACIONES' },
      }]), update: jest.fn() },
      stockLedger: { findMany: jest.fn().mockResolvedValue([latest]), create: jest.fn(), groupBy: jest.fn() },
    };
    const prisma = {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
      warehouse: { findMany: jest.fn().mockResolvedValue([{ id: ownerId }]) },
    };
    const service = new InventoryService(prisma as never, { del: jest.fn() } as never);
    const move = () => service.moveOut({
      documentId: 'document', warehouseId: originId, customerWorksiteId: 'worksite',
      items: [{ assetId, ownerWarehouseId: ownerId }],
    }, 'operator');
    return { tx, latest, service, move };
  }

  it('explains RM009186 by equipment, owner and warehouse names without modifying its inventory', async () => {
    const { tx, move } = setup();
    const error = await move().catch((value: unknown) => value) as { getResponse(): { code: string; assetId: string; message: string } };
    const response = error.getResponse();
    expect(response.code).toBe('ASSET_LOCATION_CONFLICT');
    expect(response.assetId).toBe(assetId);
    expect(response.message).toContain('MEZCLADORA #3');
    expect(response.message).toContain('TECNIREPARACIONES');
    expect(response.message).toContain('Bodega Principal de Alquiler');
    expect(response.message).not.toMatch(/ya no está|[0-9a-f]{8}-[0-9a-f-]{27}/i);
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
    expect(tx.asset.update).not.toHaveBeenCalled();
    expect(tx.stockLedger.groupBy).not.toHaveBeenCalled();
  });

  it('preserves retroactive rejection and structured dates, while naming the affected equipment', async () => {
    const { tx, latest, move } = setup();
    latest.isOpeningBalance = false;
    const error = await move().catch((value: unknown) => value) as { getResponse(): Record<string, unknown> };
    expect(error.getResponse()).toMatchObject({
      code: 'RETROACTIVE_INVENTORY_MOVEMENT', assetId,
      latestEffectiveAt: latest.effectiveAt, requestedEffectiveAt: docDate,
      message: expect.stringContaining('MEZCLADORA #3'),
    });
    expect(error.getResponse().message).not.toContain(assetId);
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
  });

  it('does not load presentation labels or change the decision for a valid historical opening', async () => {
    const { tx, service } = setup();
    await expect(service['lockAndAssertSerializedLocation'](
      tx as never, [assetId], docDate, () => ({ type: 'WAREHOUSE', id: ownerId }),
    )).resolves.toBeUndefined();
    expect(tx.asset.findMany).not.toHaveBeenCalled();
    expect(tx.warehouse.findUnique).not.toHaveBeenCalled();
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
  });
});
