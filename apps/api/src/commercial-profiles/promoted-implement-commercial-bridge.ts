import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { CommercialDocument } from './commercial-history-v2';
import type { CommercialSnapshot } from './commercial-profile.input';
import { profileSchema } from './commercial-profile.input';
import { commercialBusinessDate } from './commercial-cutoff';

export type ReviewedCommercialParent = {
  id: string;
  assetId: string;
  ownerWarehouseId: string;
  customerWorksiteId: string;
  effectiveFrom: Date;
  closedAt?: Date;
};
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const catalogSchema = z.object({ unit: z.string(), price: money.nullable() });
const review = (reason: string): CommercialSnapshot => ({ schemaVersion: 2, status: 'REVIEW', parts: [], reason });
// Only server-generated opening projections can supply an identity alias. A
// persisted DocumentItem, client JSON or another asset never acquires one.
const projectionEvidence = new WeakMap<object, { assetId: string; legacyAccessoryId: string;
  effectiveFrom: string; reviewReason?: string }>();
const cutoverEvidence = new WeakMap<object, { sourceItemId: string; assetId: string; nativeReturnDocumentId?: string | null }>();
export const isReviewedImplementCutover = (item: object) => cutoverEvidence.has(item);

/** Remove only the new identity's native return from the old commercial lot.
 * Its ledger closes the native opening instead. Persisted documents stay intact. */
export function projectReviewedImplementCutovers(documents: CommercialDocument[], projections: CommercialDocument[]) {
  const cutovers = projections.flatMap(doc => doc.items.flatMap(item => {
    const evidence = cutoverEvidence.get(item);
    return evidence ? [evidence] : [];
  }));
  if (!cutovers.length) return documents;
  return documents.map(doc => doc.type !== 'RETURN' ? doc : ({ ...doc, items: doc.items.filter(item => !cutovers.some(cut =>
    cut.nativeReturnDocumentId === doc.id && item.sourceDocumentItemId === cut.sourceItemId && item.assetId === cut.assetId)) }));
}
export function promotedImplementProjectionEvidence(item: { assetId: string | null }, date: string) {
  const evidence = projectionEvidence.get(item);
  return evidence && evidence.assetId === item.assetId && date >= evidence.effectiveFrom ? evidence : undefined;
}

function frozenSnapshot(value: unknown, assetId: string, effectiveFrom: string): CommercialSnapshot | null {
  const snapshot = value as CommercialSnapshot | null;
  if (snapshot?.schemaVersion !== 2 || !snapshot.frozenProfile || !['RESOLVED', 'REVIEW'].includes(snapshot.status) || !Array.isArray(snapshot.parts)) return null;
  const frozen = snapshot.frozenProfile;
  const profile = profileSchema.safeParse({ scopeType: 'ASSET', scopeId: assetId, expectedVersion: frozen.version,
    effectiveFrom: frozen.effectiveFrom, groups: frozen.groups, modes: frozen.modes });
  const catalog = catalogSchema.safeParse(snapshot.catalog);
  if (!profile.success || !catalog.success || frozen.effectiveFrom > effectiveFrom) return null;
  // Never reconstruct an absent commercial snapshot from today's catalogue/profile.
  return JSON.parse(JSON.stringify(snapshot));
}

/** A reviewed opening is projected, not retroactively turned into a persisted remission. */
export async function promotedImplementCommercialBridge(
  tx: Prisma.TransactionClient,
  siteId: string,
  through: string,
  parents: ReviewedCommercialParent[],
) {
  const end = new Date(Date.parse(through + 'T05:00:00Z') + 86400000);
  const bridges = await tx.implementIdentityBridge.findMany({ where: { effectiveAt: { lt: end }, assetId: { not: null },
    OR: [{ openingLedger: { customerWorksiteId: siteId, reversedByDocumentId: null, isOpeningBalance: true, refDocumentId: null } },
      { evidenceSnapshot: { path: ['documentarySource', 'document', 'customerWorksiteId'], equals: siteId } }],
  }, include: { commercialOriginReview: true, openingLedger: { include: { asset: { include: { sku: true } } } } }, take: 1001 });
  if (bridges.length > 1000) throw new BadRequestException('El historial de implementos promovidos requiere procesamiento por lotes');
  const history = bridges.length ? await tx.stockLedger.findMany({ where: { assetId: { in: bridges.flatMap(row => row.assetId ? [row.assetId] : []) },
    reversedByDocumentId: null, isOpeningBalance: false, effectiveAt: { lt: end } }, orderBy: [
    { effectiveAt: 'asc' }, { appendOrder: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' },
  ], take: 50001 }) : [];
  if (history.length > 50000) throw new BadRequestException('El historial físico de implementos promovidos requiere procesamiento por lotes');
  const documents: CommercialDocument[] = [];
  const entries: Array<{ sourceLedgerId: string; nodeId: string; effectiveFrom: string }> = [];
  for (const bridge of bridges) {
    const opening = bridge.openingLedger;
    const evidence = bridge.evidenceSnapshot as any;
    if (!bridge.assetId) continue;
    const correction = evidence?.before?.reviewedWarehouse;
    if (correction) {
      const source = evidence.documentarySource;
      const oldCustody = evidence.before?.source?.balances?.find((row: any) => row.quantity === 1 && row.customerWorksiteId === siteId);
      if (evidence.schemaVersion !== 1 || evidence.before?.source?.id !== bridge.accessoryId || evidence.asset?.id !== bridge.assetId ||
        !source || source.accessoryId !== bridge.accessoryId || source.document?.customerWorksiteId !== siteId ||
        source.document?.status !== 'CONFIRMED' || source.document.type !== 'REMISSION' || !oldCustody ||
        typeof correction.confirmation !== 'string' || correction.confirmation.trim().length < 10 ||
        correction.id !== evidence.reviewedCustody?.warehouseId || evidence.reviewedCustody?.customerWorksiteId !== null ||
        correction.id !== opening.ownerWarehouseId || opening.warehouseId !== correction.id || opening.customerWorksiteId ||
        opening.id !== bridge.openingLedgerId || opening.assetId !== bridge.assetId || !opening.isOpeningBalance ||
        opening.refDocumentId || opening.reversedByDocumentId || opening.movementType !== 'ADJUST' || !opening.quantity.eq(1) ||
        opening.effectiveAt.getTime() !== bridge.effectiveAt.getTime()) continue;
      // A today's reviewed baseline is not a fabricated past return. Close only
      // the old commercial projection at cutover, never mutate its source.
      const id = `implement-origin:${bridge.id}:legacy-closure`;
      const previousDay = new Date(Date.parse(commercialBusinessDate(bridge.effectiveAt)) - 86400000).toISOString().slice(0, 10);
      const closedItem = { id, sourceDocumentItemId: source.id, accessoryId: bridge.accessoryId, assetId: null, quantity: new Prisma.Decimal(1) };
      cutoverEvidence.set(closedItem, { sourceItemId: source.id, assetId: bridge.assetId });
      documents.push({ id, type: 'RETURN', docDate: new Date(`${previousDay}T17:00:00Z`), items: [closedItem] } as unknown as CommercialDocument);
      continue;
    }
    if (!opening.asset || opening.assetId !== bridge.assetId || opening.id !== bridge.openingLedgerId ||
      opening.movementType !== 'ON_SITE' || !opening.quantity.eq(1) ||
      opening.effectiveAt.getTime() !== bridge.effectiveAt.getTime() || opening.ownerWarehouseId !== opening.asset.warehouseOwnerId ||
      evidence?.schemaVersion !== 1 || evidence.asset?.id !== bridge.assetId ||
      evidence.before?.source?.id !== bridge.accessoryId ||
      !Array.isArray(evidence.openingLedgerIds) || !evidence.openingLedgerIds.includes(opening.id)) continue;
    let snapshot = frozenSnapshot(evidence.frozenCommercialSnapshot, bridge.assetId, commercialBusinessDate(bridge.effectiveAt)) ?? review('La apertura del implemento no tiene condiciones comerciales congeladas verificables');
    let parentLegacyOriginId: string | null = null;
    let parentSourceDocumentItemId: string | null = null;
    const custody = evidence.reviewedCustody;
    const supplement = bridge.commercialOriginReview;
    const supplementalEvidence = supplement?.evidenceSnapshot as any;
    const supplementalParentId = supplementalEvidence?.schemaVersion === 1 && supplementalEvidence.bridgeId === bridge.id &&
      supplementalEvidence.parentOriginId === supplement?.parentOriginId &&
      supplementalEvidence.assetId === custody?.parentAssetId && supplementalEvidence.customerWorksiteId === siteId &&
      supplementalEvidence.ownerWarehouseId === opening.ownerWarehouseId &&
      typeof supplementalEvidence.confirmation === 'string' && supplementalEvidence.confirmation.trim().length >= 10
      ? supplement?.parentOriginId : undefined;
    const parent = parents.find(row => row.id === (evidence.parentLegacyOriginId ?? supplementalParentId));
    const source = evidence.documentarySource;
    const previousSnapshot = source?.commercialSnapshot as CommercialSnapshot | undefined;
    if (source && [previousSnapshot?.frozenProfile, snapshot.frozenProfile].some(profile =>
      profile?.modes?.some(mode => Number(mode.minimum.value) > 0))) {
      // A cutover is not a new rental. Until report/adjustment/minimum lineage
      // has been reviewed, never silently restart a minimum on the new ID.
      snapshot = { ...snapshot, status: 'REVIEW', minimumReview: true,
        reason: 'Revisa la continuidad de mínimos y reportes del alquiler original antes de liquidar el empalme' };
    }
    const reviewedDocumentParent = source?.document?.status === 'CONFIRMED' && source.document.type === 'REMISSION' &&
      source.document.customerWorksiteId === siteId && source.componentParentAssetId === custody?.parentAssetId &&
      source.accessoryId === bridge.accessoryId &&
      source.compositionParent?.assetId === custody?.parentAssetId &&
      source.compositionParent?.condition === opening.ownerWarehouseId;
    if (reviewedDocumentParent && source.compositionNodeId && source.compositionParent?.compositionNodeId) {
      parentSourceDocumentItemId = source.compositionParent.id;
    } else if (custody?.customerWorksiteId !== siteId || custody.ownerWarehouseId !== opening.ownerWarehouseId || !custody.parentAssetId || !parent ||
      parent.assetId !== custody.parentAssetId || parent.customerWorksiteId !== siteId ||
      parent.ownerWarehouseId !== opening.ownerWarehouseId || parent.effectiveFrom > bridge.effectiveAt ||
      (parent.closedAt && parent.closedAt < bridge.effectiveAt)) {
      snapshot = review('Falta el empalme revisado del equipo principal en la misma obra para esta apertura');
    } else parentLegacyOriginId = parent.id;
    const id = `implement-origin:${bridge.id}`;
    entries.push({ sourceLedgerId: opening.id, nodeId: id, effectiveFrom: commercialBusinessDate(bridge.effectiveAt) });
    const item = {
      id, assetId: bridge.assetId, asset: opening.asset, skuId: null, sku: null, quantity: new Prisma.Decimal(1),
      commercialSnapshot: snapshot, accessoryId: null, accessory: null, parentCompositionNodeId: null,
      parentSourceDocumentItemId, parentLegacyOriginId,
    };
    projectionEvidence.set(item, { assetId: bridge.assetId, legacyAccessoryId: bridge.accessoryId,
      effectiveFrom: commercialBusinessDate(bridge.effectiveAt), ...(snapshot.status === 'REVIEW' ? { reviewReason: snapshot.reason } : {}) });
    documents.push({ id, type: 'REMISSION', docDate: bridge.effectiveAt, items: [item] } as unknown as CommercialDocument);
    // The first real movement ends this opening. A later delivery starts its own documentary lot.
    const closed = history.find(row => row.assetId === bridge.assetId && row.effectiveAt >= bridge.effectiveAt && !row.quantity.isZero());
    if (closed) documents.push({ id: `${id}:closed`, type: 'RETURN', docDate: closed.effectiveAt,
      items: [{ id: `${id}:closed`, sourceDocumentItemId: id, assetId: bridge.assetId, quantity: new Prisma.Decimal(1) }],
    } as unknown as CommercialDocument);
    if (source?.id && source.accessoryId === bridge.accessoryId && source.document?.customerWorksiteId === siteId &&
      source.document.status === 'CONFIRMED' && source.document.type === 'REMISSION') {
      // Commercial-only closure before cutover: the old and native lots never
      // coexist on a billable civil day. This is not a persisted return.
      const previousDay = new Date(Date.parse(commercialBusinessDate(bridge.effectiveAt)) - 86400000).toISOString().slice(0, 10);
      const closedItem = { id: `${id}:legacy-closure`, sourceDocumentItemId: source.id,
        accessoryId: bridge.accessoryId, assetId: null, quantity: new Prisma.Decimal(1) };
      cutoverEvidence.set(closedItem, { sourceItemId: source.id, assetId: bridge.assetId,
        nativeReturnDocumentId: closed?.movementType === 'IN' ? closed.refDocumentId : null });
      documents.push({ id: `${id}:legacy-closure`, type: 'RETURN', docDate: new Date(`${previousDay}T17:00:00Z`),
        items: [closedItem] } as unknown as CommercialDocument);
    }
  }
  return { documents, entries };
}
