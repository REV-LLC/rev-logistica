import { DocumentType, MovementType, Prisma } from '@prisma/client';

const MOVEMENT_LABELS: Record<MovementType, string> = {
  OUT: 'salida',
  IN: 'entrada',
  TRANSIT: 'en tránsito',
  ON_SITE: 'en obra',
  ADJUST: 'ajuste creación',
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Warehouse-side entries often carry the customer/worksite only on their document.
// A direct worksite takes precedence; never attribute a transfer to two worksites.
export function ledgerWorksiteWhere(
  worksite: Prisma.CustomerWorksiteWhereInput,
): Prisma.StockLedgerWhereInput {
  return {
    OR: [
      { customerWorksite: worksite },
      { customerWorksiteId: null, document: { customerWorksite: worksite } },
    ],
  };
}

export function ledgerSearchWhere(
  search?: string,
  filters: { customerId?: string; customerWorksiteId?: string } = {},
): Prisma.StockLedgerWhereInput {
  const terms = search?.trim().split(/\s+/).filter(Boolean);
  const conditions: Prisma.StockLedgerWhereInput[] =
    terms?.map(ledgerSearchTermWhere) ?? [];
  if (filters.customerId)
    conditions.push(ledgerWorksiteWhere({ customerId: filters.customerId }));
  if (filters.customerWorksiteId)
    conditions.push(ledgerWorksiteWhere({ id: filters.customerWorksiteId }));
  return conditions.length ? { AND: conditions } : {};
}

function ledgerSearchTermWhere(term: string): Prisma.StockLedgerWhereInput {
  const contains: Prisma.StringFilter = { contains: term, mode: 'insensitive' };
  const creator: Prisma.UserWhereInput = {
    OR: [
      { email: contains },
      { employee: { name: contains } },
      { employee: { lastName: contains } },
    ],
  };
  const normalized = normalize(term);
  const movementTypes = Object.values(MovementType).filter((type) =>
    normalize(`${type} ${MOVEMENT_LABELS[type]}`).includes(normalized),
  );
  const documentTypes = Object.values(DocumentType).filter((type) =>
    normalize(type).includes(normalized),
  );

  return {
    OR: [
      { document: { consecutive: contains } },
      { refDocumentId: contains },
      { skuId: contains },
      { assetId: contains },
      { sku: { name: contains } },
      { asset: { description: contains } },
      { asset: { serialOrEngine: contains } },
      { asset: { sku: { name: contains } } },
      { warehouse: { name: contains } },
      ledgerWorksiteWhere({ customer: { name: contains } }),
      ledgerWorksiteWhere({ worksite: { name: contains } }),
      ledgerWorksiteWhere({ alias: contains }),
      { creator },
      { document: { creator } },
      ...(movementTypes.length
        ? [{ movementType: { in: movementTypes } }]
        : []),
      ...(documentTypes.length
        ? [
            { refDocumentType: { in: documentTypes } },
            { document: { type: { in: documentTypes } } },
          ]
        : []),
    ],
  };
}
