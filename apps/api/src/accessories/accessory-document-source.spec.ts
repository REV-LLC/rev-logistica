import { AccessoryDocumentsService } from './accessory-documents.service';
import { accessoryDocumentOptions } from './accessory-document-options';

describe('Accessory physical source after production integration', () => {
  function fixture() {
    const parent = { id: 'parent', active: true, deletedAt: null, warehouseCurrentId: null,
      warehouseOwnerId: 'owner', sku: { assetFamilyId: 'family' } };
    const accessory = { id: 'accessory', active: true, name: 'Guaya', familyId: 'family',
      scope: 'FAMILY', ownerWarehouseId: 'owner', subfamilies: [], assets: [] };
    const source = { id: 'balance', accessoryId: accessory.id, warehouseId: 'owner',
      assetId: null, customerWorksiteId: null, transitDocumentId: null };
    const movement = { id: 'out', assetId: parent.id, ownerWarehouseId: 'owner',
      warehouseId: 'owner', customerWorksiteId: 'site', movementType: 'OUT', quantity: -1,
      refDocumentId: 'previous', refDocumentType: 'REMISSION', isOpeningBalance: false,
      effectiveAt: new Date('2026-09-01T12:00:00Z'), createdAt: new Date('2026-09-01T12:00:00Z'),
      appendOrder: 1 };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'balance' }]),
      customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'site' }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'physical', type: 'OWN' }) },
      asset: { findMany: jest.fn().mockResolvedValue([parent]), findUnique: jest.fn().mockResolvedValue(parent) },
      accessory: { findUniqueOrThrow: jest.fn().mockResolvedValue(accessory) },
      accessoryBalance: { findUnique: jest.fn().mockResolvedValue(source), findMany: jest.fn().mockResolvedValue([]) },
      accessoryMovement: { findFirst: jest.fn().mockResolvedValue(null) },
      stockLedger: { findMany: jest.fn().mockResolvedValue([movement]) },
    };
    const moveInTransaction = jest.fn();
    const service = new AccessoryDocumentsService({ moveInTransaction } as never);
    const document = { id: 'document', type: 'REMISSION', warehouseId: 'physical',
      customerWorksiteId: 'site', docDate: new Date('2026-09-02T12:00:00Z'),
      items: [{ id: 'line', accessoryId: accessory.id, accessorySourceBalanceId: source.id,
        componentParentAssetId: parent.id, quantity: 1, condition: 'owner' }] };
    return { tx, service, source, movement, document, moveInTransaction };
  }

  it('owner-origin selector excludes the unrelated physical warehouse', async () => {
    const { tx } = fixture();
    await accessoryDocumentOptions(tx as never, { type: 'REMISSION', assetId: 'parent',
      customerWorksiteId: 'site', warehouseId: 'physical', deliveryMode: 'ON_SITE', page: 0 });
    expect(tx.accessoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ id: { in: ['balance'] } }] }),
    }));
  });

  it('uses the explicit accessory-line origin instead of the document default', async () => {
    const f = fixture();
    const document = { ...f.document, items: f.document.items.map(item => ({ ...item, sourceWarehouseId: 'owner' })) };
    await f.service.apply(f.tx as never, document as never, 'user', 'WAREHOUSE');
    expect(f.moveInTransaction).toHaveBeenCalledTimes(1);
    expect(f.moveInTransaction.mock.calls[0][2].from.warehouseId).toBe('owner');
  });

  it.each(['WAREHOUSE', 'ON_SITE'] as const)('rejects stock outside the exact %s source', async (mode) => {
    const f = fixture();
    f.source.warehouseId = mode === 'ON_SITE' ? 'physical' : 'owner';
    await expect(f.service.apply(f.tx as never, f.document as never, 'user', mode))
      .rejects.toThrow('bodega de origen');
    expect(f.moveInTransaction).not.toHaveBeenCalled();
  });

  it('uses the production location resolver and excludes reversed movements', async () => {
    const f = fixture();
    await f.service.apply(f.tx as never, f.document as never, 'user', 'ON_SITE');
    expect(f.tx.stockLedger.findMany).toHaveBeenCalledWith({ where: {
      assetId: 'parent', reversedByDocumentId: null,
    } });
    expect(f.moveInTransaction).toHaveBeenCalledTimes(1);
  });

  it('a later appended return wins even if UUID order would select the dispatch', async () => {
    const f = fixture();
    f.tx.stockLedger.findMany.mockResolvedValue([
      { ...f.movement, id: 'z-dispatch' },
      { ...f.movement, id: 'a-return', movementType: 'IN', quantity: 1,
        customerWorksiteId: null, appendOrder: 2 } as any,
    ]);
    await expect(f.service.apply(f.tx as never, f.document as never, 'user', 'ON_SITE'))
      .rejects.toThrow('ya esté en esta obra');
    expect(f.moveInTransaction).not.toHaveBeenCalled();
  });
});
