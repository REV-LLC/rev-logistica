import { MovementType, Role } from '@prisma/client';
import { ProviderReturnsService } from './provider-returns.service';

describe('ProviderReturnsService pending deliveries', () => {
  it('returns only the undelivered bulk quantity and keeps serial tracking', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'bulk-ledger', movementType: MovementType.TRANSIT, quantity: 10,
        skuId: 'sku-1', assetId: null,
        sku: { name: 'Pines', assetFamily: { controlType: 'BULK' } }, asset: null,
        ownerWarehouse: { id: 'provider-1', name: 'Vereal', type: 'ALLY' },
        document: { id: 'dv-1', consecutive: 'DV000123', docDate: new Date(), createdBy: 'driver-1', customerWorksite: { customer: { name: 'Cliente' }, worksite: { name: 'Obra' } } },
        providerReceiptItems: [{ quantity: 4 }],
      },
      {
        id: 'serial-ledger', movementType: MovementType.TRANSIT, quantity: 1,
        skuId: null, assetId: 'asset-1', sku: null,
        asset: { publicCode: 'MOT-VRL-001', serialOrEngine: 'HONDA-1', description: null, sku: { name: 'Motobomba' } },
        ownerWarehouse: { id: 'provider-1', name: 'Vereal', type: 'ALLY' },
        document: { id: 'dv-1', consecutive: 'DV000123', docDate: new Date(), createdBy: 'driver-1', customerWorksite: null },
        providerReceiptItems: [],
      },
    ]);
    const service = new ProviderReturnsService({ stockLedger: { findMany } } as never);

    const result = await service.listPending({ id: 'driver-1', role: Role.DRIVER });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ sourceLedgerId: 'bulk-ledger', pendingQuantity: 6, type: 'BULK' });
    expect(result[1]).toMatchObject({ sourceLedgerId: 'serial-ledger', pendingQuantity: 1, type: 'SERIAL', publicCode: 'MOT-VRL-001' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ document: { createdBy: 'driver-1' } }) }));
  });

  it('hides fully delivered lines', async () => {
    const service = new ProviderReturnsService({ stockLedger: { findMany: jest.fn().mockResolvedValue([{
      id: 'done', quantity: 1, skuId: null, assetId: 'asset', sku: null,
      asset: { publicCode: 'A', serialOrEngine: null, description: null, sku: { name: 'Equipo' } },
      ownerWarehouse: { id: 'provider', name: 'Proveedor', type: 'ALLY' },
      document: { id: 'dv', consecutive: 'DV1', docDate: new Date(), createdBy: 'driver', customerWorksite: null },
      providerReceiptItems: [{ quantity: 1 }],
    }]) } } as never);

    await expect(service.listPending({ id: 'admin', role: Role.ADMIN })).resolves.toEqual([]);
  });
});
