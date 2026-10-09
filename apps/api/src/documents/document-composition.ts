import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { usesCommercialV2 } from '../commercial-profiles/commercial-cutoff';
import { documentReturnOrigins } from './document-return-origins';
import { assertLegacyEquipmentOrigin } from './legacy-equipment-origin';
import { reviewedDocumentaryIdentities } from '../accessories/implement-documentary-identity';
import { getWorksiteQuantityDelta, WORKSITE_BALANCE_MOVEMENT_TYPES } from '../inventory/worksite-ledger-balance';

export type CompositionFields = {
  deliveryFuel?: string | null;
  compositionNodeId?: string | null;
  parentCompositionNodeId?: string | null;
  sourceDocumentItemId?: string | null;
  parentSourceDocumentItemId?: string | null;
  parentLegacyOriginId?: string | null;
};
export type CompositionLine = CompositionFields & {
  id?: string; documentId?: string; assetId?: string | null; skuId?: string | null;
  accessoryId?: string | null; componentParentAssetId?: string | null; quantity?: unknown; condition?: string | null;
  legacyOriginId?: string;
};
export const isDocumentCompositionV2 = (date?: Date) =>
  !!date && usesCommercialV2(date);

export function compositionFields(item: CompositionFields): CompositionFields {
  return {
    ...(item.deliveryFuel ? { deliveryFuel: item.deliveryFuel } : {}),
    compositionNodeId: item.compositionNodeId ?? null,
    parentCompositionNodeId: item.parentCompositionNodeId ?? null,
    sourceDocumentItemId: item.sourceDocumentItemId ?? null,
    parentSourceDocumentItemId: item.parentSourceDocumentItemId ?? null,
    parentLegacyOriginId: item.parentLegacyOriginId ?? null,
  };
}

/** Pure graph validation is shared by drafts and confirmation. Never infer a parent from names. */
export function normalizeComposition<T extends CompositionLine>(items: T[]): T[] {
  const result = items.map(item => ({ ...item, compositionNodeId: item.compositionNodeId ?? randomUUID() }));
  const nodes = new Map(result.map(item => [item.compositionNodeId, item]));
  if (nodes.size !== result.length) throw new BadRequestException('Dos filas tienen la misma identidad de conjunto. Vuelve a abrir el documento.');
  for (const item of result) {
    if ([item.parentCompositionNodeId, item.parentSourceDocumentItemId, item.parentLegacyOriginId].filter(Boolean).length > 1)
      throw new BadRequestException('Una pieza solo puede tener un padre: en este documento o en una remisión anterior.');
    // Upgrade an explicit old parent link only when its concrete row is present.
    if (!item.parentCompositionNodeId && !item.parentSourceDocumentItemId && !item.parentLegacyOriginId && item.componentParentAssetId) {
      const candidates = result.filter(parent => parent.assetId === item.componentParentAssetId);
      if (candidates.length === 1) item.parentCompositionNodeId = candidates[0].compositionNodeId;
    }
    const seen = new Set([item.compositionNodeId]);
    let cursor = item;
    while (cursor.parentCompositionNodeId) {
      const parent = nodes.get(cursor.parentCompositionNodeId);
      if (!parent) throw new BadRequestException('Falta la fila principal de una pieza del conjunto.');
      if (seen.has(parent.compositionNodeId)) throw new BadRequestException('Un conjunto no puede contener ciclos ni incluirse a sí mismo.');
      if (seen.size >= 32) throw new BadRequestException('La configuración supera los 32 niveles permitidos.');
      seen.add(parent.compositionNodeId);
      if (!parent.assetId && !parent.accessoryId) throw new BadRequestException('El padre debe ser un equipo o un accesorio individualizado.');
      cursor = parent;
    }
  }
  return result;
}

export async function prepareDocumentComposition<T extends CompositionLine>(
  tx: Prisma.TransactionClient, items: T[], date?: Date,
): Promise<T[]> {
  if (!isDocumentCompositionV2(date)) {
    if (items.some(item => item.parentLegacyOriginId || item.parentSourceDocumentItemId || (item.parentCompositionNodeId &&
      items.find(parent => parent.compositionNodeId === item.parentCompositionNodeId)?.accessoryId)))
      throw new BadRequestException('Los conjuntos entre accesorios aplican a documentos fechados desde el 1 de octubre de 2026.');
    return items.map(item => {
      const { compositionNodeId, parentCompositionNodeId, sourceDocumentItemId, parentSourceDocumentItemId, parentLegacyOriginId, ...legacy } = item;
      return legacy as T;
    });
  }
  const rows = normalizeComposition(items);
  const referenceIds = [...new Set(rows.flatMap(item => [item.sourceDocumentItemId, item.parentSourceDocumentItemId].filter((id): id is string => !!id)))];
  const sources = referenceIds.length ? await tx.documentItem.findMany({
    where: { id: { in: referenceIds } }, include: { compositionParent: { select: { id: true } }, document: { select: { id: true, type: true, status: true, customerWorksiteId: true, docDate: true } } },
  }) : [];
  if (sources.length !== referenceIds.length) throw new BadRequestException('No se encontró una línea de origen del conjunto.');
  const bySource = new Map(sources.map(source => [source.id, source]));
  const bridgeIds = [...new Set(rows.flatMap(item => item.parentLegacyOriginId ? [item.parentLegacyOriginId] : []))];
  const bridges = bridgeIds.length ? await tx.legacyEquipmentOrigin.findMany({ where: { id: { in: bridgeIds } }, include: { sourceLedger: true } }) : [];
  if (bridges.length !== bridgeIds.length) throw new BadRequestException('El empalme histórico debe revisarse antes de usarlo.');
  const byNode = new Map(rows.map(item => [item.compositionNodeId, item]));
  const anchor = (line: CompositionLine): string | null => {
    if (line.parentLegacyOriginId) return bridges.find(origin => origin.id === line.parentLegacyOriginId)!.sourceLedger.assetId;
    if (line.parentCompositionNodeId) {
      const parent = byNode.get(line.parentCompositionNodeId)!;
      return parent.assetId ?? anchor(parent);
    }
    if (line.parentSourceDocumentItemId) {
      const parent = bySource.get(line.parentSourceDocumentItemId)!;
      return parent.assetId ?? parent.componentParentAssetId;
    }
    if (line.sourceDocumentItemId) return bySource.get(line.sourceDocumentItemId)!.componentParentAssetId;
    return line.componentParentAssetId ?? null;
  };
  return rows.map(item => {
    const source = item.sourceDocumentItemId ? bySource.get(item.sourceDocumentItemId) : undefined;
    if (source && item.deliveryFuel && item.deliveryFuel !== source.deliveryFuel)
      throw new BadRequestException('El combustible de la devolución debe coincidir con la entrega de origen.');
    return ({ ...item, ...(source ? { deliveryFuel: source.deliveryFuel } : {}), componentParentAssetId: anchor(item),
    ...(!item.parentCompositionNodeId && !item.parentSourceDocumentItemId && !item.parentLegacyOriginId && item.sourceDocumentItemId ? {
      parentSourceDocumentItemId: bySource.get(item.sourceDocumentItemId)!.compositionParent?.id ?? bySource.get(item.sourceDocumentItemId)!.parentSourceDocumentItemId,
      parentLegacyOriginId: bySource.get(item.sourceDocumentItemId)!.parentLegacyOriginId,
    } : {}),
    });
  });
}

/** Resolve immediate parents while verifying immutable documentary references. Runs inside stock transaction. */
export async function validateDocumentComposition(tx: Prisma.TransactionClient, document: {
  id: string; docDate: Date; type: string; customerWorksiteId: string | null; items: CompositionLine[];
}) {
  if (!isDocumentCompositionV2(document.docDate)) return null;
  const rows = normalizeComposition(document.items);
  const ids = [...new Set(rows.flatMap(item => [item.sourceDocumentItemId, item.parentSourceDocumentItemId].filter((id): id is string => !!id)))];
  const sources = ids.length ? await tx.documentItem.findMany({ where: { id: { in: ids } }, include: { document: true, compositionParent: { select: { id: true } } } }) : [];
  const bySource = new Map((await reviewedDocumentaryIdentities(tx, sources, document.docDate)).map(item => [item.id, item]));
  const byNode = new Map(rows.map(item => [item.compositionNodeId, item]));
  if (document.type === 'RETURN' && document.customerWorksiteId && rows.some(item => !item.sourceDocumentItemId)) {
    const origins = await documentReturnOrigins(tx, document.customerWorksiteId, document.id);
    const unidentified = new Map<string, number>();
    for (const item of rows.filter(row => !row.sourceDocumentItemId)) {
      const matching = origins.filter(origin => item.assetId ? origin.assetId === item.assetId : item.accessoryId
        ? origin.accessoryId === item.accessoryId && origin.componentParentAssetId === item.componentParentAssetId
        : origin.skuId === item.skuId && !origin.assetId && origin.ownerWarehouseId === item.condition);
      if (!matching.length) continue; // Original pre-cutover delivery keeps its legacy representation.
      if (item.assetId) throw new BadRequestException('Selecciona la remisión de origen del equipo que estás devolviendo.');
      const key = `${item.accessoryId ?? item.skuId}:${item.componentParentAssetId ?? item.condition}`;
      const requested = (unidentified.get(key) ?? 0) + Number(item.quantity ?? 1);
      unidentified.set(key, requested);
      const pendingV2 = matching.reduce((sum, origin) => sum + origin.quantity, 0);
      let physical = 0;
      if (item.accessoryId) {
        const balance = await tx.accessoryBalance.aggregate({ where: { accessoryId: item.accessoryId,
          assetId: item.componentParentAssetId, customerWorksiteId: document.customerWorksiteId,
          transitDocumentId: null, accessory: { implementBridge: null } }, _sum: { quantity: true } });
        physical = balance._sum.quantity ?? 0;
      } else if (item.skuId) {
        const movements = await tx.stockLedger.groupBy({ by: ['movementType'], where: {
          skuId: item.skuId, assetId: null, ownerWarehouseId: item.condition ?? undefined,
          customerWorksiteId: document.customerWorksiteId, movementType: { in: [...WORKSITE_BALANCE_MOVEMENT_TYPES] },
        }, _sum: { quantity: true } });
        physical = movements.reduce((sum, movement) => sum + getWorksiteQuantityDelta(movement.movementType, Number(movement._sum.quantity ?? 0)), 0);
      }
      if (requested > physical - pendingV2) throw new BadRequestException('Selecciona la remisión de origen: esta cantidad pertenece a entregas del nuevo sistema.');
    }
  }
  for (const id of ids) {
    const source = bySource.get(id);
    if (!source || source.documentId === document.id || source.document.status !== 'CONFIRMED' ||
      source.document.type !== 'REMISSION' || source.document.customerWorksiteId !== document.customerWorksiteId ||
      source.document.docDate > document.docDate)
      throw new BadRequestException('La línea de origen debe ser de una remisión confirmada anterior de esta misma obra.');
  }
  const returns = ids.length ? await tx.documentItem.findMany({
    where: { documentId: { not: document.id }, sourceDocumentItemId: { in: ids }, document: { status: 'CONFIRMED', type: 'RETURN' } },
    select: { sourceDocumentItemId: true, quantity: true, assetId: true },
  }) : [];
  const remaining = (id: string) => Number(bySource.get(id)!.quantity ?? 1) - returns
    .filter(item => item.sourceDocumentItemId === id).reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);
  const consumed = new Map<string, number>();
  const parents = new Map<string, CompositionLine>();
  const bridgeParents = new Map<string, CompositionLine>();
  for (const id of [...new Set(rows.flatMap(item => item.parentLegacyOriginId ? [item.parentLegacyOriginId] : []))]) {
    const origin = await assertLegacyEquipmentOrigin(tx, id, document.customerWorksiteId, document.docDate, document.type === 'REMISSION');
    bridgeParents.set(id, { id: `legacy-origin:${id}`, legacyOriginId: id, assetId: origin.sourceLedger.assetId });
  }
  for (const item of rows) {
    if (item.sourceDocumentItemId) {
      if (document.type !== 'RETURN') throw new BadRequestException('La línea de origen para devolución solo se usa al devolver.');
      const source = bySource.get(item.sourceDocumentItemId)!;
      if ((item.deliveryFuel ?? null) !== (source.deliveryFuel ?? null))
        throw new BadRequestException('El combustible de la devolución debe coincidir con la entrega de origen.');
      if ((item.assetId ?? null) !== source.assetId || (item.accessoryId ?? null) !== source.accessoryId || (item.skuId ?? null) !== source.skuId)
        throw new BadRequestException('El elemento devuelto no corresponde a su remisión de origen.');
      const originalParent = source.compositionParent?.id ?? source.parentSourceDocumentItemId ?? (source.parentLegacyOriginId ? `legacy-origin:${source.parentLegacyOriginId}` : undefined);
      const selectedParent = item.parentCompositionNodeId ? byNode.get(item.parentCompositionNodeId)?.sourceDocumentItemId : item.parentSourceDocumentItemId ?? (item.parentLegacyOriginId ? `legacy-origin:${item.parentLegacyOriginId}` : undefined);
      if (selectedParent && selectedParent !== originalParent)
        throw new BadRequestException('La devolución no puede cambiar el padre registrado en la remisión.');
      const quantity = (consumed.get(source.id) ?? 0) + Number(item.quantity ?? 1);
      consumed.set(source.id, quantity);
      if (quantity > remaining(source.id)) throw new BadRequestException('La devolución supera lo pendiente de esa línea de la remisión.');
    }
    const parent = item.parentCompositionNodeId ? byNode.get(item.parentCompositionNodeId) :
      item.parentSourceDocumentItemId ? bySource.get(item.parentSourceDocumentItemId) :
      item.parentLegacyOriginId ? bridgeParents.get(item.parentLegacyOriginId) : undefined;
    if (parent) {
      if (item.parentSourceDocumentItemId && document.type === 'REMISSION' && remaining(item.parentSourceDocumentItemId) <= 0)
        throw new BadRequestException('El padre ya fue devuelto; no puedes agregarle una pieza en esta obra.');
      if (item.parentSourceDocumentItemId && parent.accessoryId && document.type === 'REMISSION') {
        const present = await tx.accessoryBalance.findFirst({ where: {
          accessoryId: parent.accessoryId, assetId: parent.componentParentAssetId,
          customerWorksiteId: document.customerWorksiteId, transitDocumentId: null, quantity: { gt: 0 },
          accessory: { implementBridge: null },
        }, select: { id: true } });
        if (!present) throw new BadRequestException('El accesorio principal ya no está físicamente en esta obra.');
      }
      parents.set(item.compositionNodeId!, parent);
    } else if (document.type === 'REMISSION' && item.accessoryId)
      throw new BadRequestException('Selecciona el padre de cada accesorio en este documento o su remisión de origen en la obra.');
  }
  const accessoryParents = [...new Set([...parents.values()].flatMap(parent => parent.accessoryId ? [parent.accessoryId] : []))];
  if (accessoryParents.length) {
    const eligible = await tx.accessory.findMany({ where: { id: { in: accessoryParents }, active: true, kind: 'INDIVIDUAL', purpose: 'ACCESSORY', implementBridge: null }, select: { id: true } });
    if (eligible.length !== accessoryParents.length) throw new BadRequestException('Solo un accesorio individualizado activo puede ser padre de otro elemento.');
  }
  return { items: rows, parents };
}
