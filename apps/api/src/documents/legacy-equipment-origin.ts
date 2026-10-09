import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { resolveLatestSerializedMovements } from '../inventory/serialized-ledger-location';
import {
  commercialBusinessDate,
  usesCommercialV2,
} from '../commercial-profiles/commercial-cutoff';
import { effectiveCommercialProfile } from '../commercial-profiles/commercial-history';
import { resolveCommercialMode } from '../commercial-profiles/commercial-resolver';

export function legacyEffectiveDate(value: string) {
  const date = new Date(`${value}T05:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    commercialBusinessDate(date) !== value ||
    !usesCommercialV2(date)
  )
    throw new BadRequestException(
      'El empalme debe iniciar en una fecha válida desde el 1 de octubre de 2026.',
    );
  return date;
}

/** A read-only, single-origin inspection; catalogue similarity is never evidence of a relationship. */
export async function inspectLegacyEquipmentOrigin(
  tx: Prisma.TransactionClient,
  sourceLedgerId: string,
  effectiveFrom: string,
) {
  legacyEffectiveDate(effectiveFrom);
  const source = await tx.stockLedger.findUnique({
    where: { id: sourceLedgerId },
    include: {
      asset: { include: { sku: true } },
      document: {
        include: {
          items: {
            select: { id: true, assetId: true, compositionNodeId: true },
          },
        },
      },
      customerWorksite: { include: { worksite: true } },
    },
  });
  if (
    !source?.asset ||
    !source.asset.active ||
    source.asset.deletedAt ||
    !source.customerWorksiteId ||
    source.reversedByDocumentId ||
    source.isOpeningBalance ||
    Math.abs(Number(source.quantity)) !== 1 ||
    !['OUT', 'ON_SITE'].includes(source.movementType) ||
    !source.document ||
    source.document.status !== 'CONFIRMED' ||
    !['REMISSION', 'CUTOVER'].includes(source.document.type) ||
    usesCommercialV2(source.document.docDate) ||
    usesCommercialV2(source.effectiveAt) ||
    (source.document.customerWorksiteId &&
      source.document.customerWorksiteId !== source.customerWorksiteId)
  )
    throw new BadRequestException(
      'El origen debe ser una entrega histórica confirmada o un inventario inicial, de un equipo activo en esta obra.',
    );
  const history = await tx.stockLedger.findMany({
    where: { assetId: source.assetId, reversedByDocumentId: null },
  });
  const current = resolveLatestSerializedMovements(history).get(
    source.assetId!,
  );
  if (current?.locationMovement?.id !== source.id)
    throw new ConflictException(
      'El equipo ya no pertenece a esa entrega en obra. Revisa su movimiento actual; no reutilices un empalme anterior.',
    );
  if (
    history.filter(
      (row) =>
        row.refDocumentId === source.refDocumentId &&
        ['OUT', 'ON_SITE'].includes(row.movementType),
    ).length !== 1
  )
    throw new ConflictException(
      'Hay más de un movimiento de salida para este equipo en el origen. Debe conciliarse uno por uno.',
    );
  const matching = source.document.items.filter(
    (item) => item.assetId === source.assetId,
  );
  if (matching.length > 1 || matching.some((item) => item.compositionNodeId))
    throw new ConflictException(
      'El documento ya tiene una estructura nueva o varias líneas para este equipo. No se puede empalmar automáticamente.',
    );
  const sku = source.asset.sku;
  const profile = await effectiveCommercialProfile(
    tx,
    { assetId: source.assetId!, skuId: sku.id, familyId: sku.assetFamilyId,
      isImplement: source.asset.isImplement },
    effectiveFrom,
  );
  const catalog = {
    unit: sku.chargeType ?? '',
    price: sku.price?.toFixed(2) ?? null,
  };
  const frozenProfile = profile
    ? {
        id: profile.id,
        version: profile.version,
        effectiveFrom: profile.effectiveFrom,
        groups: profile.groups,
        modes: profile.modes,
      }
    : undefined;
  // No historical parts are assumed. They require their own documentary evidence.
  const commercialSnapshot = {
    ...(profile
      ? resolveCommercialMode(profile, [], catalog)
      : {
          status: 'REVIEW',
          reason:
            'Empalme sin condiciones comerciales aprobadas; no se asume tarifa cero.',
          parts: [],
        }),
    schemaVersion: 2,
    catalog,
    ...(frozenProfile ? { frozenProfile } : {}),
  };
  const evidence = {
    sourceLedgerId: source.id,
    assetId: source.assetId,
    ownerWarehouseId: source.ownerWarehouseId,
    customerWorksiteId: source.customerWorksiteId,
    documentId: source.refDocumentId,
    documentType: source.document.type,
    consecutive: source.document.consecutive,
    documentDate: source.document.docDate.toISOString(),
    effectiveAt: source.effectiveAt.toISOString(),
    createdAt: source.createdAt.toISOString(),
    appendOrder: source.appendOrder,
    movementType: source.movementType,
    quantity: source.quantity.toString(),
    sourceDocumentItemId: matching[0]?.id ?? null,
    label: sku.name,
    publicCode: source.asset.publicCode,
    internalNumber: source.asset.internalNumber,
    worksite: source.customerWorksite?.worksite.name ?? null,
    effectiveFrom,
    commercialSnapshot,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');
  return { source, evidence, fingerprint, commercialSnapshot };
}

export async function assertLegacyEquipmentOrigin(
  tx: Prisma.TransactionClient,
  id: string,
  siteId: string | null,
  date: Date,
  requireCurrent: boolean,
) {
  const origin = await tx.legacyEquipmentOrigin.findUnique({
    where: { id },
    include: { sourceLedger: { include: { document: true } } },
  });
  const source = origin?.sourceLedger;
  if (
    !origin ||
    !source?.assetId ||
    source.customerWorksiteId !== siteId ||
    origin.effectiveFrom > date ||
    source.effectiveAt > date ||
    source.reversedByDocumentId ||
    source.document?.status !== 'CONFIRMED'
  )
    throw new BadRequestException(
      'El empalme histórico no corresponde a esta obra, fecha o entrega confirmada.',
    );
  if (requireCurrent) {
    const history = await tx.stockLedger.findMany({
      where: { assetId: source.assetId, reversedByDocumentId: null },
    });
    if (
      resolveLatestSerializedMovements(history).get(source.assetId)
        ?.locationMovement?.id !== source.id
    )
      throw new ConflictException(
        'El equipo salió de esa entrega histórica. El empalme no se puede usar para una entrega nueva.',
      );
  }
  return origin;
}

export async function activeLegacyEquipmentOrigins(
  tx: Prisma.TransactionClient,
  customerWorksiteId: string,
) {
  const origins = await tx.legacyEquipmentOrigin.findMany({
    where: {
      sourceLedger: {
        customerWorksiteId,
        reversedByDocumentId: null,
        document: { status: 'CONFIRMED' },
      },
    },
    include: {
      sourceLedger: {
        include: { asset: { include: { sku: true } }, document: true },
      },
    },
  });
  if (!origins.length) return [];
  const history = await tx.stockLedger.findMany({
    where: {
      assetId: {
        in: origins.flatMap((o) =>
          o.sourceLedger.assetId ? [o.sourceLedger.assetId] : [],
        ),
      },
      reversedByDocumentId: null,
    },
  });
  const current = resolveLatestSerializedMovements(history);
  return origins
    .filter(
      (origin) =>
        current.get(origin.sourceLedger.assetId!)?.locationMovement?.id ===
        origin.sourceLedgerId,
    )
    .map((origin) => ({
      id: origin.id,
      sourceLedgerId: origin.sourceLedgerId,
      assetId: origin.sourceLedger.assetId!,
      customerWorksiteId,
      effectiveFrom: origin.effectiveFrom,
      name: origin.sourceLedger.asset?.sku.name,
      publicCode: origin.sourceLedger.asset?.publicCode,
      consecutive: origin.sourceLedger.document?.consecutive,
      sourceDocumentItemId:
        (origin.evidenceSnapshot as { sourceDocumentItemId?: string })
          .sourceDocumentItemId ?? null,
    }));
}
