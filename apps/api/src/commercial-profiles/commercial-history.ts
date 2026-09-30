import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CommercialGroup,
  CommercialMode,
  CompositionPart,
  CommercialSnapshot,
} from './commercial-profile.input';
import { resolveCommercialMode } from './commercial-resolver';
export async function effectiveCommercialProfile(
  tx: Pick<Prisma.TransactionClient, 'commercialProfile'>,
  target: { assetId?: string; skuId?: string; familyId?: string | null },
  date: string,
) {
  const scopes = [
    ['ASSET', target.assetId],
    ['SKU', target.skuId],
    ['FAMILY', target.familyId],
  ].filter(([, id]) => Boolean(id));
  const profiles = await tx.commercialProfile.findMany({
    where: {
      OR: scopes.map(([scopeType, scopeId]) => ({
        scopeType: scopeType!,
        scopeId: scopeId!,
      })),
    },
    include: {
      revisions: {
        where: { effectiveFrom: { lte: new Date(date + 'T00:00:00Z') } },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
        take: 1,
      },
    },
  });
  for (const [type, id] of scopes) {
    const profile = profiles.find(
      (p) => p.scopeType === type && p.scopeId === id,
    );
    const revision = profile?.revisions[0];
    if (profile && revision)
      return {
        id: profile.id,
        scopeType: profile.scopeType,
        scopeId: profile.scopeId,
        version: revision.version,
        effectiveFrom: revision.effectiveFrom.toISOString().slice(0, 10),
        ...(revision.payload as {
          groups: CommercialGroup[];
          modes: CommercialMode[];
        }),
      };
  }
  return null;
}
export async function documentCommercialSnapshots(
  tx: Prisma.TransactionClient,
  documentId: string,
  persist = false,
) {
  const doc = await tx.document.findUnique({
    where: { id: documentId },
    include: {
      items: {
        include: {
          asset: { include: { sku: true } },
          sku: true,
          accessory: true,
        },
      },
    },
  });
  if (!doc)
    throw new NotFoundException(
      'Documento no encontrado al fijar condiciones comerciales',
    );
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(doc.docDate);
  const snapshots = new Map<string, CommercialSnapshot>();
  for (const item of doc.items.filter((i) => i.assetId || i.skuId)) {
    if (item.commercialSnapshot) {
      snapshots.set(
        item.id,
        item.commercialSnapshot as unknown as CommercialSnapshot,
      );
      continue;
    }
    const sku = item.asset?.sku ?? item.sku;
    if (!sku) continue;
    const parts: CompositionPart[] = doc.items
      .filter((i) => i.componentParentAssetId === item.assetId && item.assetId)
      .map((p) => ({
        documentItemId: p.id,
        parentAssetId: item.assetId!,
        ...(p.assetId ? { assetId: p.assetId } : {}),
        ...((p.asset?.skuId ?? p.skuId)
          ? { skuId: (p.asset?.skuId ?? p.skuId)! }
          : {}),
        ...((p.asset?.sku.assetFamilyId ?? p.sku?.assetFamilyId)
          ? { familyId: (p.asset?.sku.assetFamilyId ?? p.sku?.assetFamilyId)! }
          : {}),
        ...(p.accessoryId ? { accessoryId: p.accessoryId } : {}),
        label: p.asset?.sku.name ?? p.sku?.name ?? p.accessory?.name ?? 'Pieza',
        quantity: p.assetId ? 1 : Number(p.quantity ?? 1),
      }));
    const profile = await effectiveCommercialProfile(
      tx,
      {
        assetId: item.assetId ?? undefined,
        skuId: sku.id,
        familyId: sku.assetFamilyId,
      },
      date,
    );
    // Absence is explicit evidence too: creating a future profile cannot reinterpret this delivery.
    const snapshot: CommercialSnapshot = profile
      ? resolveCommercialMode(profile, parts, {
          unit: sku.chargeType,
          price: sku.price?.toFixed(2) ?? '0',
        })
      : {
          status: 'REVIEW',
          reason: 'No existe modalidad comercial vigente para la entrega',
          parts: parts.map((p) => ({ ...p, treatment: 'REVIEW' })),
        };
    snapshots.set(item.id, snapshot);
    if (persist)
      await tx.documentItem.update({
        where: { id: item.id },
        data: {
          commercialSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
  }
  return snapshots;
}
