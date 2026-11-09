import { BadRequestException } from '@nestjs/common';
import { defaultAnnexPolicy } from './annex-input';
import { calculateAnnex } from './annex-engine';
import { Prisma } from '@prisma/client';
import {
  applyDailyBillingStart,
  billingStartRuleSchema,
  billingStartSettingKey,
} from './annex-billing-start';
import { inventoryToAnnex } from './annex-inventory';
import type { Cut } from './annex-billing-overview';
import { PrismaService } from '../prisma/prisma.service';

const stockFields = {
  id: true,
  customerWorksiteId: true,
  skuId: true,
  assetId: true,
  ownerWarehouseId: true,
  reversedByDocumentId: true,
  movementType: true,
  quantity: true,
  effectiveAt: true,
  sku: { select: { id: true, name: true, price: true, chargeType: true } },
  document: {
    select: {
      id: true,
      status: true,
      type: true,
      docDate: true,
      notes: true,
      consecutive: true,
      items: {
        select: {
          skuId: true,
          assetId: true,
          quantity: true,
          condition: true,
          billingCutoffDate: true,
        },
      },
    },
  },
} satisfies Prisma.StockLedgerSelect;
type Stock = Prisma.StockLedgerGetPayload<{ select: typeof stockFields }>;

export type CutActivity = { days: string[]; review: boolean };
type Candidate = { siteId: string; cutFrom: string };

/** Ordinary daily bulk needs only physical quantities, not a price calculation per site and cut.
 * Defer ambiguous references and commercial configurations to the normal annex generator. */
export async function ordinaryBulkActivity(
  db: PrismaService,
  candidates: Candidate[],
  cuts: Cut[],
) {
  const result = new Map<string, CutActivity>();
  if (!candidates.length) return result;
  const sites = [...new Set(candidates.map((c) => c.siteId))];
  const [blocked, setting, later] = await Promise.all([
    db.$queryRaw<Array<{ site: string; sku: string }>>`
      SELECT DISTINCT d."customerWorksiteId" AS site, i."skuId" AS sku
      FROM "DocumentItem" i JOIN "Document" d ON d.id=i."documentId"
      WHERE d.status='CONFIRMED' AND i."skuId" IS NOT NULL
        AND (i."commercialSnapshot" IS NOT NULL OR i."parentCompositionNodeId" IS NOT NULL
          OR i."parentSourceDocumentItemId" IS NOT NULL OR i."parentLegacyOriginId" IS NOT NULL
          OR i."componentParentAssetId" IS NOT NULL OR i."accessoryId" IS NOT NULL
          OR EXISTS (SELECT 1 FROM "DocumentItem" child WHERE child."sourceDocumentItemId"=i.id OR child."parentSourceDocumentItemId"=i.id
             OR (child."documentId"=i."documentId" AND child."parentCompositionNodeId"=i."compositionNodeId")))
      UNION
      SELECT DISTINCT l."customerWorksiteId", l."skuId" FROM "StockLedger" l JOIN "Sku" s ON s.id=l."skuId"
      JOIN "CommercialProfile" p ON (p."scopeType"='SKU' AND p."scopeId"=s.id)
          OR (p."scopeType"='FAMILY' AND p."scopeId"=s."assetFamilyId")
      WHERE l."customerWorksiteId" IS NOT NULL`,
    db.appSetting.findUnique({
      where: { key: billingStartSettingKey },
      select: { value: true },
    }),
    db.stockLedger.aggregate({
      where: {
        customerWorksiteId: { in: sites },
        document: {
          type: 'RETURN',
          status: 'CONFIRMED',
          items: {
            some: {
              billingCutoffDate: {
                lt: new Date(
                  Date.parse(cuts.at(-1)!.through + 'T05:00:00Z') + 86400000,
                ),
              },
            },
          },
        },
      },
      _max: { effectiveAt: true },
    }),
  ]);
  const rule = setting ? billingStartRuleSchema.parse(setting.value) : null;
  const excluded = new Set(blocked.map((b) => b.site + '/' + b.sku));
  const end = new Date(
    Math.max(
      Date.parse(cuts.at(-1)!.through + 'T05:00:00Z') + 86400000,
      (later._max.effectiveAt?.getTime() ?? 0) + 1,
    ),
  );
  for (let offset = 0; offset < sites.length; offset += 20) {
    const batch = sites.slice(offset, offset + 20);
    const rows = await db.stockLedger.findMany({
      where: { customerWorksiteId: { in: batch }, effectiveAt: { lt: end } },
      select: stockFields,
      orderBy: [
        { effectiveAt: 'asc' },
        { appendOrder: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: 50001,
    });
    if (rows.length > 50000) continue;
    const bySite = new Map<string, Stock[]>();
    for (const row of rows) {
      const group = bySite.get(row.customerWorksiteId!) ?? [];
      group.push(row);
      bySite.set(row.customerWorksiteId!, group);
    }
    for (const candidate of candidates.filter((c) =>
      batch.includes(c.siteId),
    )) {
      const cut = cuts.find((c) => c.from === candidate.cutFrom)!;
      const siteRows = bySite.get(candidate.siteId) ?? [];
      const through = new Date(
        Date.parse(cut.through + 'T05:00:00Z') + 86400000,
      );
      const late = siteRows
        .filter(
          (row) =>
            row.effectiveAt >= through &&
            row.document?.type === 'RETURN' &&
            row.document.status === 'CONFIRMED' &&
            row.document.items.some(
              (i) => i.billingCutoffDate && i.billingCutoffDate < through,
            ),
        )
        .at(-1);
      const applicable = siteRows.filter((row) =>
        late ? row.effectiveAt <= late.effectiveAt : row.effectiveAt < through,
      );
      // The annex generator also checks reversal evidence beyond this cut.
      if (applicable.some((row) => row.reversedByDocumentId)) continue;
      const simple = applicable.filter(
        (row) =>
          !row.assetId &&
          row.sku?.chargeType === 'DAY' &&
          !excluded.has(candidate.siteId + '/' + row.skuId),
      );
      if (!simple.length) continue;
      try {
        const source = inventoryToAnnex(simple, cut);
        if (source.issues.length) continue;
        applyDailyBillingStart(source.rentals, simple, rule);
        const annex = calculateAnnex({
          period: cut,
          rentals: source.rentals,
          machineDays: [],
          policy: defaultAnnexPolicy(),
        });
        const days = new Set(annex.lines.map((line) => line.date));
        const everyDay =
          days.size ===
          1 + (Date.parse(cut.through) - Date.parse(cut.from)) / 86400000;
        if (everyDay || simple.length === applicable.length)
          result.set(candidate.siteId + '/' + cut.from, {
            days: [...days],
            review: false,
          });
      } catch (error) {
        // The authoritative preparation reports the affected cut for review.
        if (!(error instanceof BadRequestException)) throw error;
      }
    }
  }
  return result;
}
