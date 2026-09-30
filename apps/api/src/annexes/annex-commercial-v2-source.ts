import { Prisma } from '@prisma/client';
import type { AnnexInput } from './annex-input';
import type { CommercialSnapshot } from '../commercial-profiles/commercial-profile.input';
import {
  commercialBusinessDate,
  usesCommercialV2,
} from '../commercial-profiles/commercial-cutoff';
import {
  commercialNodesAt,
  type CommercialDocument,
} from '../commercial-profiles/commercial-history-v2';
import { resolveComposition } from '../commercial-profiles/commercial-composition';
import type { SourceIssue } from './annex-inventory';

type Lot = AnnexInput['rentals'][number];
type Movement = {
  requestId: string;
  documentId: string | null;
  accessoryId: string;
  quantity: number;
  to: unknown;
  from: unknown;
};
const nextDay = (date: string, delta = 1) =>
  new Date(Date.parse(date) + delta * 86400000).toISOString().slice(0, 10);
const datesBetween = (from: string, to: string) => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = nextDay(date)) dates.push(date);
  return dates;
};

/** Explicit v2 document origins, including accessory quantities which never enter StockLedger. */
export function prepareCommercialV2(
  documents: CommercialDocument[],
  mappedLots: Array<{ lot: Lot; itemId: string }>,
  movements: Movement[],
  period: AnnexInput['period'],
  siteId: string,
  history: AnnexInput[],
) {
  const issues: SourceIssue[] = [];
  const origins = new Map(
    documents
      .filter((d) => d.type === 'REMISSION' && usesCommercialV2(d.docDate))
      .flatMap((doc) =>
        doc.items.map((item) => [item.id, { doc, item }] as const),
      ),
  );
  const lots = mappedLots.map(({ lot, itemId }) => ({
    itemId,
    lot: {
      ...lot,
      returns: documents
        .filter((d) => d.type === 'RETURN')
        .flatMap((d) =>
          d.items
            .filter((i) => i.sourceDocumentItemId === itemId)
            .map((i) => ({
              date: commercialBusinessDate(d.docDate),
              quantity: String(i.assetId ? 1 : (i.quantity ?? 1)),
              source: { reference: i.id, origin: 'INVENTORY' as const },
            })),
        ),
    },
  }));
  const invalidMovement = new Set<string>();
  for (const [id, { doc, item }] of origins) {
    if (!item.accessoryId) continue;
    const movement = movements.find(
      (m) =>
        m.requestId === `document:${doc.id}:item:${id}` &&
        m.accessoryId === item.accessoryId,
    );
    const expected = Number(item.quantity ?? 1);
    if (
      !movement ||
      movement.quantity !== expected ||
      (movement.to as { customerWorksiteId?: string })?.customerWorksiteId !==
        siteId
    ) {
      issues.push({
        code: 'COMMERCIAL_MOVEMENT_REVIEW',
        reference: id,
        message:
          'La entrega del accesorio no coincide con un movimiento efectivo en esta obra',
      });
      invalidMovement.add(id);
    }
    for (const returnedDoc of documents.filter((d) => d.type === 'RETURN')) {
      for (const returnedItem of returnedDoc.items.filter(
        (i) => i.sourceDocumentItemId === id,
      )) {
        const returnedMovement = movements.find(
          (m) =>
            m.requestId ===
              `document:${returnedDoc.id}:item:${returnedItem.id}` &&
            m.accessoryId === item.accessoryId,
        );
        if (
          !returnedMovement ||
          returnedMovement.quantity !== Number(returnedItem.quantity ?? 1) ||
          (returnedMovement.from as { customerWorksiteId?: string })
            ?.customerWorksiteId !== siteId
        ) {
          invalidMovement.add(id);
          issues.push({
            code: 'COMMERCIAL_MOVEMENT_REVIEW',
            reference: returnedItem.id,
            message:
              'La devolución del accesorio no coincide con su movimiento efectivo',
          });
        }
      }
    }
    const returns = documents
      .filter((d) => d.type === 'RETURN')
      .flatMap((d) =>
        d.items
          .filter((i) => i.sourceDocumentItemId === id)
          .map((i) => ({
            date: commercialBusinessDate(d.docDate),
            quantity: String(i.quantity ?? 1),
            source: { reference: i.id, origin: 'INVENTORY' as const },
          })),
      );
    lots.push({
      itemId: id,
      lot: {
        id,
        skuId: item.accessoryId,
        accessoryId: item.accessoryId,
        label: item.accessory?.name ?? item.accessoryName ?? 'Accesorio',
        deliveredOn: commercialBusinessDate(doc.docDate),
        quantity: String(expected),
        returns,
        source: { reference: id, origin: 'INVENTORY' },
        pricing: { basePrice: '0' },
        waivedDays: [],
      },
    });
  }
  const rentals: AnnexInput['rentals'] = [],
    machineDays: AnnexInput['machineDays'] = [];
  const cache = new Map<string, Map<string, CommercialSnapshot>>();
  const at = (date: string) => {
    if (!cache.has(date)) {
      const nodes = commercialNodesAt(documents, date);
      const resolved = resolveComposition(nodes);
      for (const invalid of invalidMovement) {
        const seen = new Set<string>();
        let cursor: string | undefined = invalid;
        while (cursor && !seen.has(cursor)) {
          seen.add(cursor);
          const snapshot = resolved.get(cursor);
          if (snapshot)
            resolved.set(cursor, {
              ...snapshot,
              status: 'REVIEW',
              reason:
                'El movimiento de una pieza de este conjunto está pendiente de conciliación',
            });
          cursor = nodes.find((node) => node.id === cursor)?.parentId;
        }
      }
      cache.set(date, resolved);
    }
    return cache.get(date)!;
  };
  for (const { lot, itemId } of lots) {
    const origin = origins.get(itemId);
    if (!origin) continue;
    const boundaries = [
      ...new Set([
        lot.deliveredOn,
        ...documents.map((d) =>
          d.type === 'RETURN'
            ? nextDay(commercialBusinessDate(d.docDate))
            : commercialBusinessDate(d.docDate),
        ),
      ]),
    ]
      .filter((date) => date >= lot.deliveredOn && date <= period.through)
      .sort();
    const segments: Array<{
      from: string;
      to: string;
      snapshot: CommercialSnapshot;
    }> = [];
    for (let index = 0; index < boundaries.length; index++) {
      const from = boundaries[index],
        to =
          index + 1 < boundaries.length
            ? nextDay(boundaries[index + 1], -1)
            : period.through;
      const snapshot = at(from).get(itemId);
      if (!snapshot) continue;
      const previous = segments[segments.length - 1];
      if (
        previous &&
        JSON.stringify(previous.snapshot) === JSON.stringify(snapshot)
      )
        previous.to = to;
      else segments.push({ from, to, snapshot });
    }
    const payableModes = new Set(
      segments.filter((s) => s.snapshot.mode).map((s) => s.snapshot.mode!.id),
    );
    const hasUnsettledModeMinimum =
      payableModes.size > 1 &&
      segments.some(
        (s) =>
          !s.snapshot.contextualZero &&
          s.snapshot.mode?.minimum.basis === 'PER_RENTAL' &&
          Number(s.snapshot.mode.minimum.value) > 0,
      );
    for (const segment of segments) {
      if (segment.to < period.from) continue;
      let snapshot = segment.snapshot;
      if (invalidMovement.has(itemId))
        snapshot = {
          ...snapshot,
          status: 'REVIEW',
          reason: 'Falta conciliar el movimiento físico del accesorio',
        };
      if (hasUnsettledModeMinimum)
        snapshot = {
          ...snapshot,
          status: 'REVIEW',
          reason:
            'Confirma cómo distribuir los mínimos entre las modalidades utilizadas en este alquiler',
        };
      const id = `${lot.id}@${segment.from}`;
      const old = history.flatMap((h) => h.rentals).find((r) => r.id === id);
      const rental: Lot = {
        ...lot,
        id,
        commercial: snapshot,
        commercialInterval: {
          from: segment.from,
          to: segment.to,
          rentalId: lot.id,
        },
        pricing: { basePrice: snapshot.basePrice ?? '0' },
        waivedDays: [],
        dayAdjustments: [],
        minimumHistoryRanges: segments
          .filter(
            (s) =>
              s.snapshot.mode?.id === snapshot.mode?.id && s.to < period.from,
          )
          .map((s) => ({
            from: s.from,
            to: s.to,
            rentalId: `${lot.id}@${s.from}`,
          })),
      };
      // Explicit zero is a priced presence row, not an inferred report and not an omitted part.
      if (snapshot.contextualZero) rental.pricing = { basePrice: '0.00' };
      if (snapshot.status !== 'RESOLVED') {
        issues.push({
          code: 'COMMERCIAL_REVIEW',
          reference: id,
          message: snapshot.reason ?? 'Condiciones comerciales pendientes',
        });
        rentals.push(rental);
        continue;
      }
      if (snapshot.mode?.unit === 'HOUR') {
        const identity = lot.assetId ?? lot.accessoryId;
        if (!identity || Number(lot.quantity) !== 1) {
          rental.commercial = {
            ...snapshot,
            status: 'REVIEW',
            reason:
              'La modalidad horaria requiere una unidad identificada por línea',
          };
          rentals.push(rental);
          continue;
        }
        for (const date of datesBetween(
          segment.from > period.from ? segment.from : period.from,
          segment.to,
        )) {
          if (!at(date).has(itemId)) continue;
          const oldDay = history
            .flatMap((h) => h.machineDays)
            .find((d) => d.rentalId === id && d.date === date);
          machineDays.push({
            assetId: identity,
            rentalId: id,
            label: lot.label,
            date,
            status: oldDay?.status ?? 'PENDING',
            reports: oldDay?.reports ?? [],
            ...(oldDay?.confirmationReason
              ? { confirmationReason: oldDay.confirmationReason }
              : {}),
            pricing: rental.pricing,
            commercial: snapshot,
          });
        }
      } else {
        if (snapshot.mode?.unit === 'METER') {
          const earlierReports = new Map<string, string>();
          for (const saved of history.flatMap((h) => h.rentals)) {
            if (
              saved.commercialInterval?.rentalId !== lot.id ||
              saved.commercial?.mode?.id !== snapshot.mode.id ||
              saved.commercialInterval.to >= period.from
            )
              continue;
            for (const report of saved.metering?.reports ?? []) {
              if (!earlierReports.has(report.source.reference))
                earlierReports.set(report.source.reference, report.meters);
            }
          }
          rental.metering = {
            minimumMeters: snapshot.mode.minimum.value,
            priorUnits: [...earlierReports.values()]
              .reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0))
              .toString(),
            pricing: rental.pricing,
            reports: old?.metering?.reports ?? [],
          };
        }
        rentals.push(rental);
      }
    }
  }
  return { rentals, machineDays, issues };
}
