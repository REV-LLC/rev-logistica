import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CommercialDocument } from './commercial-history-v2';
import { commercialBusinessDate } from './commercial-cutoff';

/** Read-only graph projections, never persisted as historical documents or stock movements. */
export async function legacyCommercialBridge(
  tx: Prisma.TransactionClient,
  siteId: string,
  through: string,
) {
  const end = new Date(Date.parse(through + 'T05:00:00Z') + 86400000);
  const origins = await tx.legacyEquipmentOrigin.findMany({
    where: {
      effectiveFrom: { lt: end },
      sourceLedger: {
        customerWorksiteId: siteId,
        reversedByDocumentId: null,
        document: { status: 'CONFIRMED' },
      },
    },
    include: {
      sourceLedger: { include: { asset: { include: { sku: true } } } },
    },
    take: 1001,
  });
  if (origins.length > 1000)
    throw new BadRequestException(
      'El historial de empalmes requiere procesamiento por lotes',
    );
  const history = origins.length
    ? await tx.stockLedger.findMany({
        where: {
          assetId: {
            in: origins.flatMap((o) =>
              o.sourceLedger.assetId ? [o.sourceLedger.assetId] : [],
            ),
          },
          reversedByDocumentId: null,
          isOpeningBalance: false,
          effectiveAt: { lt: end },
        },
        orderBy: [
          { effectiveAt: 'asc' },
          { appendOrder: { sort: 'asc', nulls: 'first' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        take: 50001,
      })
    : [];
  if (history.length > 50000)
    throw new BadRequestException(
      'El historial físico de empalmes requiere procesamiento por lotes',
    );
  const documents: CommercialDocument[] = [];
  const entries: Array<{
    sourceLedgerId: string;
    nodeId: string;
    effectiveFrom: string;
  }> = [];
  for (const origin of origins) {
    const source = origin.sourceLedger;
    if (!source.asset) continue;
    const rows = history.filter((row) => row.assetId === source.assetId);
    const position = rows.findIndex((row) => row.id === source.id);
    if (position < 0) continue;
    const closed = rows
      .slice(position + 1)
      .find((row) => !row.quantity.isZero());
    const id = `legacy-origin:${origin.id}`;
    entries.push({
      sourceLedgerId: source.id,
      nodeId: id,
      effectiveFrom: commercialBusinessDate(origin.effectiveFrom),
    });
    const item = {
      id,
      assetId: source.assetId,
      asset: source.asset,
      skuId: null,
      sku: null,
      quantity: new Prisma.Decimal(1),
      commercialSnapshot: origin.commercialSnapshot,
      accessoryId: null,
      accessory: null,
      parentCompositionNodeId: null,
      parentSourceDocumentItemId: null,
      parentLegacyOriginId: origin.parentOriginId ?? null,
    };
    documents.push({
      id,
      type: 'REMISSION',
      docDate: origin.effectiveFrom,
      items: [item],
    } as unknown as CommercialDocument);
    if (closed)
      documents.push({
        id: `${id}:closed`,
        type: 'RETURN',
        docDate: closed.effectiveAt,
        items: [
          {
            id: `${id}:closed`,
            sourceDocumentItemId: id,
            assetId: source.assetId,
            quantity: new Prisma.Decimal(1),
          },
        ],
      } as unknown as CommercialDocument);
  }
  return { documents, entries };
}
