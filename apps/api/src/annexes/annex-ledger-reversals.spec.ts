import { Prisma } from '@prisma/client';
import { effectiveAnnexRows } from './annex-ledger-reversals';

type Row = Parameters<typeof effectiveAnnexRows>[0][number];
const original: Row = {
  id: 'old',
  customerWorksiteId: 'site',
  warehouseId: 'warehouse',
  ownerWarehouseId: 'owner',
  assetId: null,
  skuId: 'sku',
  reversedByDocumentId: 'reversal',
  refDocumentId: 'return',
  movementType: 'IN',
  quantity: new Prisma.Decimal(15),
  document: { type: 'RETURN', status: 'CONFIRMED' },
};
const inverse: Row = {
  ...original,
  id: 'inverse',
  refDocumentId: 'reversal',
  reversedByDocumentId: null,
  movementType: 'OUT',
  quantity: new Prisma.Decimal(-15),
  document: { type: 'ADJUSTMENT', status: 'CONFIRMED' },
};

describe('reconciling ledger corrections for billing', () => {
  it('keeps the corrected posting and other items in the same adjustment', () => {
    const active = { ...original, id: 'valid', reversedByDocumentId: null };
    const other = { ...inverse, id: 'other', skuId: 'other' };
    expect(effectiveAnnexRows([active, original, inverse, other], [])).toEqual([
      active,
      other,
    ]);
  });
  it.each<Partial<Row>>([
    { quantity: new Prisma.Decimal(-14) },
    { refDocumentId: 'unlinked' },
    { ownerWarehouseId: 'other' },
    { customerWorksiteId: 'other' },
    { warehouseId: 'other' },
    { assetId: 'other' },
    { document: { type: 'ADJUSTMENT', status: 'VOID' } },
    { document: { type: 'REMISSION', status: 'CONFIRMED' } },
  ])('retains unmatched postings for the existing review path', (change) => {
    const rows = [original, { ...inverse, ...change }];
    expect(effectiveAnnexRows(rows, [])).toEqual(rows);
  });
});
