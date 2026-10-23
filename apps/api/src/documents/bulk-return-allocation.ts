import { BadRequestException } from '@nestjs/common';
import { DocumentItem, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { usesCommercialV2 } from '../commercial-profiles/commercial-cutoff';
import { lockBulkStock } from '../inventory/bulk-stock-lock';

type Source = Pick<
  DocumentItem,
  | 'id'
  | 'skuId'
  | 'assetId'
  | 'accessoryId'
  | 'quantity'
  | 'condition'
  | 'sourceDocumentItemId'
  | 'compositionNodeId'
  | 'parentCompositionNodeId'
  | 'parentSourceDocumentItemId'
  | 'parentLegacyOriginId'
  | 'componentParentAssetId'
> & {
  compositionParent?: { id: string } | null;
};
export type BulkReturnHistory = {
  id: string;
  skuId: string | null;
  ownerWarehouseId: string;
  movementType: string;
  quantity: Prisma.Decimal;
  effectiveAt: Date;
  reversedByDocumentId: string | null;
  document: {
    id: string;
    type: string;
    status: string;
    docDate: Date;
    items: Source[];
  } | null;
};
type Requested = Pick<
  DocumentItem,
  'id' | 'skuId' | 'assetId' | 'accessoryId' | 'quantity' | 'condition'
>;
type Portion = { source: Source | null; quantity: Prisma.Decimal };
const isBulk = (line: Requested) =>
  !!line.skuId && !line.assetId && !line.accessoryId;
const key = (sku: string | null, owner: string | null) =>
  JSON.stringify([sku, owner]);

/** Replay physical custody, respecting every already-confirmed documentary allocation.
 * The caller supplies ledger order (effectiveAt/appendOrder/createdAt/id). A new return
 * is inserted after existing movements at its instant; later movements must remain valid.
 * Decimal quantities are never converted to floating point for allocation or comparison.
 */
export function planBulkReturnAllocation(
  history: BulkReturnHistory[],
  items: Requested[],
  at: Date,
) {
  // A backdated return must not steal units already used by a later confirmed
  // return. Reserve those exact historical portions before choosing eligible FIFO.
  const reserved = new Map<string, Prisma.Decimal>();
  const replay = (allocate: boolean) => {
    const plans = new Map<string, Portion[]>();
    const lots = new Map<string, Array<Portion & { reservationKey: string }>>();
    const arrived = new Map<string, Prisma.Decimal>();
    const review = () =>
      new BadRequestException(
        'El historial de este material requiere conciliación antes de devolver; no se modificó ningún movimiento.',
      );
    const consume = (
      group: string,
      amount: Prisma.Decimal,
      sourceId?: string | null,
      current = false,
      future = false,
    ) => {
      const portions: Portion[] = [];
      let remaining = amount;
      for (const lot of lots.get(group) ?? []) {
        if (remaining.isZero()) break;
        if (sourceId && lot.source?.id !== sourceId) continue;
        const available = current
          ? lot.quantity.minus(reserved.get(lot.reservationKey) ?? 0)
          : lot.quantity;
        const taken = Prisma.Decimal.min(available, remaining);
        if (taken.lte(0)) continue;
        lot.quantity = lot.quantity.minus(taken);
        remaining = remaining.minus(taken);
        if (!allocate && future)
          reserved.set(
            lot.reservationKey,
            (reserved.get(lot.reservationKey) ?? new Prisma.Decimal(0)).plus(
              taken,
            ),
          );
        portions.push({ source: lot.source, quantity: taken });
      }
      if (remaining.gt(0)) {
        if (!current) throw review();
        const available = amount.minus(remaining).toString();
        throw new BadRequestException(
          `La devolución supera el saldo total en obra de esta referencia y propietario a la fecha del documento. Disponible: ${available}.`,
        );
      }
      return portions;
    };
    const insertReturn = () => {
      if (!allocate) return;
      for (const item of items.filter(isBulk)) {
        if (!item.condition)
          throw new BadRequestException(
            'Selecciona el propietario de cada material que vas a devolver.',
          );
        const amount = new Prisma.Decimal(item.quantity ?? 0);
        if (!amount.isFinite() || amount.lte(0))
          throw new BadRequestException(
            'La cantidad a devolver debe ser mayor que cero.',
          );
        plans.set(
          item.id,
          consume(key(item.skuId, item.condition), amount, null, true),
        );
      }
    };
    let inserted = false;
    for (const movement of history) {
      if (!inserted && movement.effectiveAt > at) {
        insertReturn();
        inserted = true;
      }
      if (
        movement.reversedByDocumentId ||
        (movement.document && movement.document.status !== 'CONFIRMED')
      )
        throw review();
      const group = key(movement.skuId, movement.ownerWarehouseId);
      const lines =
        movement.document?.items.filter(
          (line) =>
            isBulk(line) &&
            line.skuId === movement.skuId &&
            line.condition === movement.ownerWarehouseId,
        ) ?? [];
      const entering =
        movement.movementType === 'OUT' || movement.movementType === 'ON_SITE';
      const amount =
        movement.movementType === 'OUT'
          ? movement.quantity.negated()
          : movement.quantity;
      if (!amount.isFinite() || amount.lt(0)) throw review();
      if (amount.isZero()) continue;
      if (entering) {
        let remainder = amount;
        if (movement.document?.type === 'REMISSION') {
          for (const source of lines) {
            const previouslyArrived =
              arrived.get(source.id) ?? new Prisma.Decimal(0);
            const part = Prisma.Decimal.min(
              new Prisma.Decimal(source.quantity ?? 0).minus(previouslyArrived),
              remainder,
            );
            if (part.lte(0)) continue;
            arrived.set(source.id, previouslyArrived.plus(part));
            const queue = lots.get(group) ?? [];
            queue.push({
              source,
              quantity: part,
              reservationKey: `${movement.id}:${source.id}`,
            });
            lots.set(group, queue);
            remainder = remainder.minus(part);
          }
        }
        if (remainder.gt(0)) {
          // Only a pre-cutover ledger-only delivery may lack a documentary line.
          if (movement.document && usesCommercialV2(movement.document.docDate))
            throw review();
          const queue = lots.get(group) ?? [];
          queue.push({
            source: null,
            quantity: remainder,
            reservationKey: `${movement.id}:legacy`,
          });
          lots.set(group, queue);
        }
      } else {
        if (!['IN', 'TRANSIT'].includes(movement.movementType)) throw review();
        // Linked returns reserve their actual lot; old unlinked returns consume FIFO.
        // Multiple ledger rows for one document consume its lines only once.
        let remainder = amount;
        for (const line of movement.document?.type === 'RETURN' ? lines : []) {
          const usedKey = `returned:${line.id}`;
          const used = arrived.get(usedKey) ?? new Prisma.Decimal(0);
          const part = Prisma.Decimal.min(
            new Prisma.Decimal(line.quantity ?? 0).minus(used),
            remainder,
          );
          if (part.lte(0)) continue;
          consume(
            group,
            part,
            line.sourceDocumentItemId,
            false,
            movement.effectiveAt > at,
          );
          arrived.set(usedKey, used.plus(part));
          remainder = remainder.minus(part);
        }
        if (remainder.gt(0))
          consume(group, remainder, null, false, movement.effectiveAt > at);
      }
    }
    if (!inserted) insertReturn();
    return plans;
  };
  replay(false);
  return replay(true);
}

/** Called only for a new direct document or a locked draft, inside its serializable
 * stock transaction. Never rewrites a confirmed historical return or a tariff snapshot.
 */
export async function allocateBulkReturnItems(
  tx: Prisma.TransactionClient,
  document: {
    id: string;
    type: string;
    docDate: Date;
    customerWorksiteId: string | null;
    items: DocumentItem[];
  },
) {
  if (document.type !== 'RETURN' || !usesCommercialV2(document.docDate))
    return document.items;
  const bulk = document.items.filter(isBulk);
  if (!bulk.length) return document.items;
  if (!document.customerWorksiteId)
    throw new BadRequestException('La devolución requiere obra.');
  if (bulk.some((item) => !item.condition))
    throw new BadRequestException(
      'Selecciona el propietario de cada material que vas a devolver.',
    );
  await lockBulkStock(
    tx,
    bulk.map((item) => item.skuId!),
  );
  const pairs = [
    ...new Map(
      bulk.map((item) => [
        key(item.skuId, item.condition),
        {
          skuId: item.skuId!,
          ownerWarehouseId: item.condition!,
        },
      ]),
    ).values(),
  ];
  const history = await tx.stockLedger.findMany({
    where: {
      customerWorksiteId: document.customerWorksiteId,
      assetId: null,
      OR: pairs,
      AND: [
        {
          OR: [
            { refDocumentId: null },
            { refDocumentId: { not: document.id } },
          ],
        },
      ],
      movementType: { in: ['OUT', 'ON_SITE', 'IN', 'TRANSIT'] },
    },
    orderBy: [
      { effectiveAt: 'asc' },
      { appendOrder: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    take: 50001,
    select: {
      id: true,
      skuId: true,
      ownerWarehouseId: true,
      movementType: true,
      quantity: true,
      effectiveAt: true,
      reversedByDocumentId: true,
      document: {
        select: {
          id: true,
          type: true,
          status: true,
          docDate: true,
          items: {
            where: {
              skuId: { in: bulk.map((item) => item.skuId!) },
              assetId: null,
              accessoryId: null,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              skuId: true,
              assetId: true,
              accessoryId: true,
              quantity: true,
              condition: true,
              sourceDocumentItemId: true,
              compositionNodeId: true,
              parentCompositionNodeId: true,
              parentSourceDocumentItemId: true,
              parentLegacyOriginId: true,
              componentParentAssetId: true,
              compositionParent: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (history.length > 50000)
    throw new BadRequestException(
      'El historial de materiales requiere procesamiento por lotes.',
    );
  const plans = planBulkReturnAllocation(history, bulk, document.docDate);
  const result: DocumentItem[] = [];
  for (const item of document.items) {
    const portions = plans.get(item.id);
    if (!portions) {
      result.push(item);
      continue;
    }
    for (const [index, portion] of portions.entries()) {
      const source = portion.source;
      const data = {
        quantity: portion.quantity,
        sourceDocumentItemId: source?.id ?? null,
        parentCompositionNodeId: null,
        parentSourceDocumentItemId:
          source?.compositionParent?.id ??
          source?.parentSourceDocumentItemId ??
          null,
        parentLegacyOriginId: source?.parentLegacyOriginId ?? null,
        componentParentAssetId: source?.componentParentAssetId ?? null,
      };
      if (index === 0) {
        result.push(
          await tx.documentItem.update({ where: { id: item.id }, data }),
        );
      } else {
        // Preserve damage/cutoff fields and the return date, not the source's tariff.
        const clone = {
          ...item,
          ...data,
          id: randomUUID(),
          compositionNodeId: randomUUID(),
        };
        await tx.documentItem.createMany({
          data: [clone as Prisma.DocumentItemCreateManyInput],
        });
        result.push(clone);
      }
    }
  }
  return result;
}
