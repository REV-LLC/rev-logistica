import { AssetsService } from './assets.service';

describe('Asset card physical balance after a documentary return', () => {
  function fixture(returned: boolean) {
    const row = (id: string, movementType: string, quantity: number, warehouseId: string, day: number) => ({
      id, assetId: 'machine', ownerWarehouseId: 'owner', warehouseId,
      customerWorksiteId: id === 'opening' ? null : 'site',
      customerWorksite: id === 'opening' ? null : { id: 'site' },
      warehouse: { id: warehouseId, name: warehouseId },
      movementType, quantity, isOpeningBalance: id === 'opening',
      refDocumentId: id === 'opening' ? null : id, refDocumentType: null,
      createdAt: new Date(`2026-09-0${day}T12:00:00Z`), effectiveAt: new Date(`2026-09-0${day}T12:00:00Z`),
    });
    const rows = [row('opening', 'IN', 1, 'owner', 1), row('remission', 'OUT', -1, 'owner', 2)];
    if (returned) rows.push(row('return', 'IN', 1, 'receiving-warehouse', 3));
    const prisma = { asset: { findUnique: jest.fn().mockResolvedValue({ id: 'machine', warehouseOwnerId: 'owner', warehouseOwner: { type: 'OWN' } }) },
      stockLedger: { findMany: jest.fn().mockResolvedValue(rows) } };
    return new AssetsService(prisma as any, {} as any);
  }
  it('reports one unit in the receiving warehouse even when it is not the owner warehouse', async () => {
    expect(await fixture(true).getAssetLocation('machine')).toMatchObject({
      locationType: 'WAREHOUSE', warehouse: { id: 'receiving-warehouse' },
      balance: { warehouseQuantity: 1, worksiteQuantity: 0, isConsistent: true },
    });
  });
  it('still reports zero at the warehouse and one at the worksite before return', async () => {
    expect(await fixture(false).getAssetLocation('machine')).toMatchObject({
      locationType: 'CUSTOMER_WORKSITE', customerWorksite: { id: 'site' },
      balance: { warehouseQuantity: 0, worksiteQuantity: 1, isConsistent: true },
    });
  });
});
