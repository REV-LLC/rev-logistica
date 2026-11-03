import { Prisma } from '@prisma/client';
import { AnnexSourceService } from './annex-source.service';
const siteId = '00000000-0000-4000-8000-000000000001';
const sku = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Formaleta',
  price: new Prisma.Decimal('2750'),
  replacementValue: new Prisma.Decimal('150000'),
};
function setup(rows: unknown[] = []) {
  const prisma = {
    customerWorksite: { findUnique: jest.fn(async () => ({ id: siteId })) },
    stockLedger: { findMany: jest.fn(async () => rows) },
  };
  return { prisma, service: new AnnexSourceService(prisma as never) };
}
it('lists distinct historical worksite tags with their current replacement prices', async () => {
  const asset = {
    id: '00000000-0000-4000-8000-000000000003',
    publicCode: 'FM-002',
    sku,
  };
  const { service, prisma } = setup([
    { sku: null, asset },
    { sku: null, asset },
    { sku: { ...sku, replacementValue: null }, asset: null },
    { sku: null, asset: null },
  ]);
  const result = await service.chargeOptions(siteId);
  expect(result).toHaveLength(2);
  expect(result).toContainEqual({
    id: `asset:${asset.id}`,
    assetId: asset.id,
    skuId: sku.id,
    label: 'FM-002 · Formaleta',
    price: '2750',
    replacementValue: '150000',
  });
  expect(result).toContainEqual({
    id: `sku:${sku.id}`,
    skuId: sku.id,
    label: 'Formaleta',
    price: '2750',
    replacementValue: null,
  });
  // All dates and returned equipment remain eligible; cancelled or reversed deliveries do not.
  expect(prisma.stockLedger.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        customerWorksiteId: siteId,
        reversedByDocumentId: null,
        AND: [
          {
            OR: [
              { movementType: 'OUT', quantity: { lt: 0 } },
              { movementType: 'ON_SITE', quantity: { gt: 0 } },
            ],
          },
          {
            OR: [
              { refDocumentId: null },
              { document: { status: 'CONFIRMED' } },
            ],
          },
        ],
      },
      distinct: ['assetId', 'skuId'],
    }),
  );
});
it('rejects unknown worksites and invalid identifiers before reading their history', async () => {
  const { service, prisma } = setup();
  await expect(service.chargeOptions('invalid')).rejects.toThrow(
    'Obra inválida',
  );
  expect(prisma.customerWorksite.findUnique).not.toHaveBeenCalled();
  prisma.customerWorksite.findUnique.mockResolvedValueOnce(null as never);
  await expect(service.chargeOptions(siteId)).rejects.toThrow(
    'Obra no encontrada',
  );
  expect(prisma.stockLedger.findMany).not.toHaveBeenCalled();
});
it('returns an empty selector for a worksite without deliveries', async () => {
  expect(await setup().service.chargeOptions(siteId)).toEqual([]);
});
