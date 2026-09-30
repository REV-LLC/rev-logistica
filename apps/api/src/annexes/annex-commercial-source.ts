import { usesCommercialV2 } from '../commercial-profiles/commercial-cutoff';
import { prepareCommercialV2 } from './annex-commercial-v2-source';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnnexInput } from './annex-input';
import type { CommercialSnapshot } from '../commercial-profiles/commercial-profile.input';
import { documentCommercialSnapshots } from '../commercial-profiles/commercial-history';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import type { SourceIssue } from './annex-inventory';

type Ledger = {
  id: string;
  refDocumentId: string | null;
  assetId: string | null;
  skuId: string | null;
  ownerWarehouseId: string;
  effectiveAt: Date;
  quantity: Prisma.Decimal;
  movementType: string;
};
// Inclusion is contextual, including the physical return day. A child left behind
// must be reviewed rather than silently billed free in later cuts.
export function parentCoversRental(
  lot: AnnexInput['rentals'][number],
  parentRows: Pick<Ledger, 'quantity' | 'movementType' | 'effectiveAt'>[],
  period: AnnexInput['period'],
) {
  for (
    let time = Math.max(Date.parse(period.from), Date.parse(lot.deliveredOn));
    time <= Date.parse(period.through);
    time += 86400000
  ) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (
      lot.returns
        .filter((r) => r.date < date)
        .reduce((sum, r) => sum + Number(r.quantity), 0) >= Number(lot.quantity)
    )
      continue;
    const balance = parentRows.reduce((sum, r) => {
      const day = inventoryBusinessDay(r.effectiveAt),
        delta =
          r.movementType === 'ON_SITE' ? r.quantity : r.quantity.negated();
      return day < date || (day === date && delta.gt(0))
        ? sum.plus(delta)
        : sum;
    }, new Prisma.Decimal(0));
    if (balance.lte(0)) return false;
  }
  return true;
}
// Inventory creates stable delivery lots first, independently of the eventual billing unit.
export async function applyCommercialComposition(
  tx: Prisma.TransactionClient,
  lots: AnnexInput['rentals'],
  rows: Ledger[],
  period: AnnexInput['period'],
  siteId: string,
  history: AnnexInput[],
) {
  const documents = await tx.document.findMany({
    where: {
      customerWorksiteId: siteId,
      status: 'CONFIRMED',
      docDate: {
        lt: new Date(Date.parse(period.through + 'T05:00:00Z') + 86400000),
      },
    },
    take: 5001,
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
  if (documents.length > 5000)
    throw new BadRequestException(
      'El historial documental requiere procesamiento por lotes',
    );
  const accessoryMovements = await tx.accessoryMovement.findMany({
    where: { documentId: { in: documents.map((d) => d.id) } },
    select: {
      id: true,
      requestId: true,
      documentId: true,
      accessoryId: true,
      quantity: true,
      from: true,
      to: true,
    },
    take: 50001,
  });
  if (accessoryMovements.length > 50000)
    throw new BadRequestException(
      'El historial de accesorios requiere procesamiento por lotes',
    );
  const byDocument = new Map(documents.map((d) => [d.id, d]));
  const mappedV2 = lots.flatMap((lot) => {
    const row = rows.find((r) => r.id === lot.source.reference);
    const doc = row?.refDocumentId
      ? byDocument.get(row.refDocumentId)
      : undefined;
    if (!doc || !usesCommercialV2(doc.docDate)) return [];
    const items = doc.items.filter((i) =>
      lot.assetId
        ? i.assetId === lot.assetId
        : !i.assetId &&
          i.skuId === lot.skuId &&
          (!i.condition || i.condition === row?.ownerWarehouseId),
    );
    return items.length === 1 ? [{ lot, itemId: items[0].id }] : [];
  });
  const v2 = prepareCommercialV2(
    documents,
    mappedV2,
    accessoryMovements,
    period,
    siteId,
    history,
  );
  const handledV2 = new Set(mappedV2.map((entry) => entry.lot.id));
  const snapshots = new Map<string, Map<string, CommercialSnapshot>>();
  const issues: SourceIssue[] = [];
  const rentals: AnnexInput['rentals'] = [],
    machineDays: AnnexInput['machineDays'] = [];
  for (const lot of lots) {
    if (handledV2.has(lot.id)) continue;
    const row = rows.find((r) => r.id === lot.source.reference);
    const doc = row?.refDocumentId
      ? byDocument.get(row.refDocumentId)
      : undefined;
    const items =
      doc?.items.filter((i) =>
        lot.assetId
          ? i.assetId === lot.assetId
          : !i.assetId &&
            i.skuId === lot.skuId &&
            (!i.condition || i.condition === row?.ownerWarehouseId),
      ) ?? [];
    let snapshot: CommercialSnapshot = {
      status: 'REVIEW',
      reason:
        'No hay vínculo único entre el saldo y un ítem de remisión confirmado',
      parts: [],
    };
    let includedIn: AnnexInput['rentals'][number]['includedIn'];
    if (doc && items.length === 1) {
      if (!snapshots.has(doc.id))
        snapshots.set(doc.id, await documentCommercialSnapshots(tx, doc.id));
      const item = items[0];
      snapshot = snapshots.get(doc.id)!.get(item.id) ?? snapshot;
      const saved = history
        .flatMap((h) => [...h.rentals, ...h.machineDays])
        .find(
          (r) =>
            ('id' in r && r.id === lot.id) ||
            ('rentalId' in r && r.rentalId === lot.id),
        );
      if (saved?.commercial) snapshot = saved.commercial as CommercialSnapshot;
      else if (!item.commercialSnapshot)
        issues.push({
          code: 'COMMERCIAL_HISTORY_REVIEW',
          reference: lot.id,
          message:
            'Entrega anterior al snapshot comercial: confirma las condiciones históricas antes de facturar',
        });
      const lineage = new Set<string>();
      let cursor = item;
      while (cursor.componentParentAssetId) {
        if (lineage.has(cursor.componentParentAssetId)) {
          snapshot = {
            ...snapshot,
            status: 'REVIEW',
            reason: 'Vínculo documental cíclico',
          };
          break;
        }
        lineage.add(cursor.componentParentAssetId);
        const ancestor = doc.items.find(
          (i) => i.assetId === cursor.componentParentAssetId,
        );
        const ancestorSnapshot = ancestor
          ? snapshots.get(doc.id)!.get(ancestor.id)
          : undefined;
        const edge = ancestorSnapshot?.parts.find(
          (p) => p.documentItemId === cursor.id,
        );
        if (
          edge?.treatment === 'INCLUDED' &&
          ancestorSnapshot?.status === 'RESOLVED'
        )
          includedIn = {
            assetId: cursor.componentParentAssetId,
            label: ancestor?.asset?.sku.name ?? 'Equipo principal',
            documentItemId: item.id,
          };
        if (!ancestor) break;
        cursor = ancestor;
      }
      if (item.componentParentAssetId && !includedIn) {
        const parent = doc.items.find(
          (i) => i.assetId === item.componentParentAssetId,
        );
        const parentSnapshot = parent
          ? snapshots.get(doc.id)!.get(parent.id)
          : undefined;
        const part = parentSnapshot?.parts.find(
          (p) => p.documentItemId === item.id,
        );
        if (
          part?.treatment === 'INCLUDED' &&
          parentSnapshot?.status === 'RESOLVED'
        )
          includedIn = {
            assetId: item.componentParentAssetId,
            label: parent?.asset?.sku.name ?? 'Equipo principal',
            documentItemId: item.id,
          };
        else if (!part || part.treatment !== 'INDEPENDENT')
          snapshot = {
            ...snapshot,
            status: 'REVIEW',
            reason:
              'Falta confirmar el tratamiento comercial de esta pieza vinculada',
          };
      }
      // A later return/replacement needs its own commercial interval; do not keep billing
      // the original composition silently. Historical snapshots remain unchanged.
      if (snapshot.parts.length) {
        const missingAccessory = snapshot.parts.some(
          (p) =>
            p.accessoryId &&
            !accessoryMovements.some(
              (m) =>
                m.requestId === `document:${doc.id}:item:${p.documentItemId}` &&
                m.accessoryId === p.accessoryId &&
                m.quantity === p.quantity,
            ),
        );
        if (missingAccessory)
          snapshot = {
            ...snapshot,
            status: 'REVIEW',
            reason:
              'No se pudo conciliar la composición con los movimientos efectivos de accesorios',
          };
        const changed = documents.some(
          (d) =>
            inventoryBusinessDay(d.docDate) >= lot.deliveredOn &&
            inventoryBusinessDay(d.docDate) <= period.through &&
            d.id !== doc.id &&
            d.items.some((i) =>
              snapshot.parts.some(
                (p) =>
                  (p.assetId && i.assetId === p.assetId) ||
                  (p.accessoryId && i.accessoryId === p.accessoryId),
              ),
            ) &&
            !d.items.some((i) => i.assetId === lot.assetId),
        );
        if (changed)
          snapshot = {
            ...snapshot,
            status: 'REVIEW',
            reason:
              'Cambió la composición durante el alquiler: concilia el tramo comercial antes de cobrar',
          };
      }
    }
    if (
      snapshot.parts.some((p) => p.accessoryId && p.treatment === 'INDEPENDENT')
    )
      snapshot = {
        ...snapshot,
        status: 'REVIEW',
        reason:
          'El accesorio tiene cobro independiente pendiente de un concepto medible propio; no se omite ni se presume incluido',
      };
    const nestedAccessories = snapshot.parts.flatMap((p) =>
      p.accessoryId ? [p.accessoryId] : [],
    );
    if (
      nestedAccessories.length &&
      (await tx.equipmentConfiguration.count({
        where: {
          accessoryId: { in: nestedAccessories },
          entries: { some: {} },
        },
      }))
    )
      snapshot = {
        ...snapshot,
        status: 'REVIEW',
        reason:
          'El conjunto contiene relaciones entre accesorios sin padre documental suficiente; requiere conciliación',
      };
    if (
      includedIn &&
      !parentCoversRental(
        lot,
        rows.filter((r) => r.assetId === includedIn!.assetId),
        period,
      )
    ) {
      includedIn = undefined;
      snapshot = {
        ...snapshot,
        status: 'REVIEW',
        reason:
          'La pieza permanece en obra sin su equipo principal: define su condición comercial para ese tramo',
      };
    }
    lot.commercial = snapshot;
    lot.includedIn = includedIn;
    if (snapshot.status === 'REVIEW' && !includedIn)
      issues.push({
        code: 'COMMERCIAL_REVIEW',
        reference: lot.id,
        message: snapshot.reason ?? 'Modalidad comercial pendiente',
      });
    const mode = snapshot.status === 'RESOLVED' ? snapshot.mode : undefined;
    if (mode && snapshot.basePrice !== undefined)
      lot.pricing = { basePrice: snapshot.basePrice };
    if (mode?.unit === 'HOUR' && !includedIn) {
      if (!lot.assetId) {
        lot.commercial = {
          ...snapshot,
          status: 'REVIEW',
          reason:
            'La modalidad horaria requiere una unidad de equipo identificada',
        };
        rentals.push(lot);
        continue;
      }
      for (
        let time = Math.max(
          Date.parse(lot.deliveredOn),
          Date.parse(period.from),
        );
        time <= Date.parse(period.through);
        time += 86400000
      ) {
        const date = new Date(time).toISOString().slice(0, 10);
        const returned = lot.returns
          .filter((r) => r.date < date)
          .reduce((n, r) => n + Number(r.quantity), 0);
        if (Number(lot.quantity) - returned <= 0) continue;
        machineDays.push({
          assetId: lot.assetId,
          rentalId: lot.id,
          label: lot.label,
          date,
          status: 'PENDING',
          reports: [],
          pricing: lot.pricing,
          commercial: snapshot,
        });
      }
    } else {
      if (mode?.unit === 'METER') {
        const old = history
          .flatMap((h) => h.rentals)
          .find((r) => r.id === lot.id);
        lot.metering = {
          minimumMeters: mode.minimum.value,
          pricing: lot.pricing,
          reports: old?.metering?.reports ?? old?.cutting?.reports ?? [],
        };
      }
      rentals.push(lot);
    }
  }
  return {
    rentals: [...rentals, ...v2.rentals],
    machineDays: [...machineDays, ...v2.machineDays],
    issues: [...issues, ...v2.issues],
  };
}
