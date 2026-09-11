import { DocumentStatus, DocumentType, MovementType, Prisma, Role } from '@prisma/client';
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

describe('ProviderReturnsService receipt event dates', () => {
  it.each([MovementType.IN, MovementType.TRANSIT])(
    'assigns one effective date to the confirmed receipt and every ledger row from %s',
    async (sourceMovement) => {
      const tx = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'receipt', type: DocumentType.PROVIDER_RECEIPT, status: DocumentStatus.DRAFT,
            createdBy: 'operator', warehouseId: 'provider', consecutive: 'RP000002',
            files: [
              { category: 'EVIDENCIA_ENTREGA_PROVEEDOR' },
              { category: 'COMPROBANTE_RECEPCION_PROVEEDOR' },
            ],
            providerReceiptItems: [{
              sourceLedgerId: 'return-row', skuId: null, assetId: 'mixer', quantity: new Prisma.Decimal(1),
              sourceLedger: {
                movementType: sourceMovement, quantity: new Prisma.Decimal(1),
                warehouseId: sourceMovement === MovementType.IN ? 'own' : null,
                ownerWarehouseId: 'provider', skuId: null,
              },
            }],
          }),
          update: jest.fn(),
        },
        stockLedger: { create: jest.fn().mockResolvedValue({ id: 'created-row' }) },
        providerReceiptItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: null } }) },
        asset: { updateMany: jest.fn() },
      };
      const service = new ProviderReturnsService({
        $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
      } as never);
      const before = Date.now();
      await expect(service.confirm('receipt', { id: 'operator', role: Role.ADMIN }))
        .resolves.toMatchObject({ status: DocumentStatus.CONFIRMED });
      const writes = tx.stockLedger.create.mock.calls.map(([args]) => args.data);
      expect(writes).toHaveLength(sourceMovement === MovementType.IN ? 2 : 1);
      const eventDate = writes[0].effectiveAt;
      expect(eventDate).toBeInstanceOf(Date);
      expect(eventDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(eventDate.getTime()).toBeLessThanOrEqual(Date.now());
      for (const write of writes) {
        expect(write.effectiveAt).toBe(eventDate);
        expect(write).not.toHaveProperty('createdAt');
        expect(write).toMatchObject({
          ownerWarehouseId: 'provider', assetId: 'mixer', refDocumentId: 'receipt',
          refDocumentType: DocumentType.PROVIDER_RECEIPT,
        });
        expect(Number(write.quantity)).toBe(write.movementType === MovementType.OUT ? -1 : 1);
      }
      expect(tx.document.update).toHaveBeenCalledWith({
        where: { id: 'receipt' }, data: { status: DocumentStatus.CONFIRMED, docDate: eventDate },
      });
      expect(tx.asset.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['mixer'] } }, data: { warehouseCurrentId: 'provider' },
      });
    },
  );
});
