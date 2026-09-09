import { DocumentType, MovementType, Prisma } from '@prisma/client';

const MOVEMENT_LABELS: Record<MovementType, string> = {
  OUT: 'salida',
  IN: 'entrada',
  TRANSIT: 'en tránsito',
  ON_SITE: 'en obra',
  ADJUST: 'ajuste creación',
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function ledgerSearchWhere(search?: string): Prisma.StockLedgerWhereInput {
  const terms = search?.trim().split(/\s+/).filter(Boolean);
  if (!terms?.length) return {};
  return { AND: terms.map(ledgerSearchTermWhere) };
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
  const movementTypes = Object.values(MovementType).filter(
    (type) => normalize(`${type} ${MOVEMENT_LABELS[type]}`).includes(normalized),
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
      { customerWorksite: { customer: { name: contains } } },
      { customerWorksite: { worksite: { name: contains } } },
      { creator },
      { document: { creator } },
      ...(movementTypes.length ? [{ movementType: { in: movementTypes } }] : []),
      ...(documentTypes.length
        ? [
            { refDocumentType: { in: documentTypes } },
            { document: { type: { in: documentTypes } } },
          ]
        : []),
    ],
  };
}
