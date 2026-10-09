import { legacyCommercialBridge } from './commercial-legacy-bridge';
import { documentDeliveryLabel } from '../documents/document-delivery-fuel';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { commercialBusinessDate, usesCommercialV2 } from './commercial-cutoff';
import { effectiveCommercialProfile } from './commercial-history';
import {
  resolveComposition,
  type CommercialNode,
} from './commercial-composition';
import type { CommercialSnapshot } from './commercial-profile.input';
import { promotedImplementProjectionEvidence, projectReviewedImplementCutovers } from './promoted-implement-commercial-bridge';

export const commercialDocumentInclude = {
  items: {
    include: { asset: { include: { sku: true } }, sku: true, accessory: true },
  },
} satisfies Prisma.DocumentInclude;
export type CommercialDocument = Prisma.DocumentGetPayload<{
  include: typeof commercialDocumentInclude;
}>;

/** Returns stay present on their physical return day; composition changes take effect on civil dates. */
export function commercialNodesAt(
  documents: CommercialDocument[],
  date: string,
): CommercialNode[] {
  const deliveries = documents.filter(
    (d) =>
      d.type === 'REMISSION' &&
      usesCommercialV2(d.docDate) &&
      commercialBusinessDate(d.docDate) <= date,
  );
  const nodes = deliveries.flatMap((doc) =>
    doc.items.map((item) => {
      const sku = item.asset?.sku ?? item.sku;
      const promotion = promotedImplementProjectionEvidence(item, date);
      const parent = item.parentCompositionNodeId
        ? doc.items.find(
            (p) => p.compositionNodeId === item.parentCompositionNodeId,
          )?.id
        : (item.parentSourceDocumentItemId ??
          (item.parentLegacyOriginId
            ? `legacy-origin:${item.parentLegacyOriginId}`
            : undefined));
      const returned = documents
        .filter(
          (d) =>
            d.type === 'RETURN' && commercialBusinessDate(d.docDate) < date,
        )
        .flatMap((d) => d.items)
        .filter((i) => i.sourceDocumentItemId === item.id)
        .reduce((sum, i) => sum + (i.assetId ? 1 : Number(i.quantity ?? 1)), 0);
      return {
        id: item.id,
        parentId: parent,
        assetId: item.assetId ?? undefined,
        skuId: sku?.id,
        accessoryId: item.accessoryId ?? undefined,
        ...(promotion ? { legacyAccessoryId: promotion.legacyAccessoryId, projectionReviewReason: promotion.reviewReason } : {}),
        familyId: sku?.assetFamilyId ?? undefined,
        label: documentDeliveryLabel(
          sku?.name ?? item.accessory?.name ?? item.accessoryName ?? 'Elemento',
          item.assetId ? item.deliveryFuel : null,
        ),
        quantity: (item.assetId ? 1 : Number(item.quantity ?? 1)) - returned,
        snapshot:
          (item.commercialSnapshot as unknown as CommercialSnapshot | null) ?? {
            status: 'REVIEW' as const,
            schemaVersion: 2 as const,
            reason: 'Entrega sin condiciones comerciales congeladas',
            parts: [],
          },
      };
    }),
  );
  const legacyIds = new Set(
    documents
      .filter((d) => d.type === 'REMISSION' && !usesCommercialV2(d.docDate))
      .flatMap((d) => d.items.map((i) => i.id)),
  );
  for (const node of nodes) {
    if (node.parentId && legacyIds.has(node.parentId))
      node.snapshot = {
        status: 'REVIEW',
        schemaVersion: 2,
        reason:
          'El padre pertenece a una entrega histórica; confirma las condiciones de este nuevo conjunto',
        parts: [],
      };
  }
  return nodes.filter((node) => node.quantity > 0);
}

export async function documentCommercialSnapshotsV2(
  tx: Prisma.TransactionClient,
  doc: CommercialDocument,
  persist: boolean,
) {
  const date = commercialBusinessDate(doc.docDate);
  const documents = doc.customerWorksiteId
    ? await tx.document.findMany({
        where: {
          customerWorksiteId: doc.customerWorksiteId,
          status: 'CONFIRMED',
          id: { not: doc.id },
          docDate: { lt: new Date(Date.parse(date + 'T05:00:00Z') + 86400000) },
        },
        include: commercialDocumentInclude,
        take: 5001,
      })
    : [];
  if (documents.length > 5000)
    throw new BadRequestException(
      'El historial documental requiere procesamiento por lotes',
    );
  for (const item of doc.items) {
    if (item.commercialSnapshot) continue;
    const sku = item.asset?.sku ?? item.sku;
    const profile = await effectiveCommercialProfile(
      tx,
      {
        assetId: item.assetId ?? undefined,
        skuId: sku?.id,
        familyId: sku?.assetFamilyId,
        accessoryId: item.accessoryId ?? undefined,
        isImplement: item.asset?.isImplement ?? sku?.isImplement,
      },
      date,
    );
    const snapshot: CommercialSnapshot = {
      schemaVersion: 2,
      status: 'REVIEW',
      parts: [],
      catalog: {
        unit: sku?.chargeType ?? '',
        price: sku?.price?.toFixed(2) ?? null,
      },
      ...(profile
        ? {
            frozenProfile: {
              id: profile.id,
              version: profile.version,
              effectiveFrom: profile.effectiveFrom,
              groups: profile.groups,
              modes: profile.modes,
            },
          }
        : {}),
      reason: 'No existe modalidad comercial vigente para la entrega',
    };
    item.commercialSnapshot = snapshot as unknown as Prisma.JsonValue;
  }
  const bridge = doc.customerWorksiteId
    ? await legacyCommercialBridge(tx, doc.customerWorksiteId, date)
    : { documents: [] };
  const snapshots = resolveComposition(
    commercialNodesAt([...projectReviewedImplementCutovers(documents, bridge.documents), ...bridge.documents, doc], date),
  );
  const result = new Map<string, CommercialSnapshot>();
  for (const item of doc.items) {
    const snapshot =
      snapshots.get(item.id) ??
      (item.commercialSnapshot as unknown as CommercialSnapshot);
    result.set(item.id, snapshot);
    if (persist)
      await tx.documentItem.update({
        where: { id: item.id },
        data: {
          commercialSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
  }
  return result;
}
