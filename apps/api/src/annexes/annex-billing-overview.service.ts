import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import { PrismaService } from '../prisma/prisma.service';
import {
  billingCuts,
  classifyBillingCut,
  type BillingRow,
  type Cut,
  type SavedCut,
} from './annex-billing-overview';
import { ordinaryBulkActivity } from './annex-billing-activity';
import { AnnexSourceService } from './annex-source.service';

type Site = {
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
};
type Activity = { days: string[]; review: boolean };
type Entry = Site & BillingRow & { cutFrom: string; cutTo: string };

@Injectable()
export class AnnexBillingOverviewService {
  private readonly logger = new Logger(AnnexBillingOverviewService.name);
  private progress = { processed: 0, total: 0 };
  private pendingActivity?: {
    key: string;
    expires: number;
    value: Promise<Map<string, Activity>>;
  };

  constructor(
    private readonly db: PrismaService,
    private readonly source: AnnexSourceService,
  ) {}

  private async candidates(cuts: Cut[]) {
    // Aggregate by owner and individual reference so one returned item cannot
    // cancel an outstanding balance of a different reference or owner.
    const bounds = Prisma.join(
      cuts.map(
        (c) =>
          Prisma.sql`(${c.from}::text, ${new Date(c.from + 'T05:00:00Z')}::timestamp, ${new Date(Date.parse(c.through + 'T05:00:00Z') + 86400000)}::timestamp)`,
      ),
    );
    return this.db.$queryRaw<Array<{ siteId: string; cutFrom: string }>>`
      WITH cuts(day, start_at, end_at) AS (VALUES ${bounds}),
      candidates AS (
        SELECT c.day, l."customerWorksiteId" AS site
        FROM cuts c JOIN "StockLedger" l ON l."effectiveAt" < c.end_at
        WHERE l."customerWorksiteId" IS NOT NULL
        GROUP BY c.day, c.start_at, l."customerWorksiteId", l."ownerWarehouseId", l."skuId", l."assetId"
        HAVING BOOL_OR(l."effectiveAt" >= c.start_at)
          OR SUM(CASE WHEN l."movementType" = 'ON_SITE' THEN l.quantity ELSE -l.quantity END) > 0
      )
      SELECT DISTINCT site AS "siteId", day AS "cutFrom" FROM candidates
      UNION
      SELECT d."customerWorksiteId", c.day FROM cuts c
        JOIN "DocumentItem" i ON i."billingCutoffDate" >= c.start_at
        JOIN "Document" d ON d.id=i."documentId"
        WHERE d.type='RETURN' AND d.status='CONFIRMED' AND d."customerWorksiteId" IS NOT NULL
          AND d."docDate" < c.end_at
      ORDER BY 1, 2`;
  }

  private async loadActivity(cuts: Cut[]) {
    const candidates = await this.candidates(cuts);
    const progress = (this.progress = {
      processed: 0,
      total: candidates.length,
    });
    const result = await ordinaryBulkActivity(this.db, candidates, cuts);
    progress.processed = result.size;
    let index = 0;
    const worker = async () => {
      while (index < candidates.length) {
        const { siteId, cutFrom } = candidates[index++];
        const cut = cuts.find((item) => item.from === cutFrom)!;
        const key = siteId + '/' + cutFrom;
        if (result.has(key)) continue;
        try {
          // Use the annex engine, including FIFO, commercial modes, return
          // cutoffs, zero tariffs, and balances originating before the window.
          const { result: annex, sourceIssues } = await this.source.prepare(
            siteId,
            cut.from,
            cut.to,
            cut.through,
          );
          result.set(key, {
            days: [...new Set(annex.lines.map((line) => line.date))],
            review: sourceIssues.some(
              (issue) => issue.code === 'INVENTORY_REVIEW',
            ),
          });
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
          this.logger.warn(
            `No se pudo conciliar ${key}: ${error instanceof Error ? error.message : 'Error de consulta'}`,
          );
          result.set(key, { days: [], review: true });
        }
        progress.processed++;
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, candidates.length) }, worker),
    );
    return result;
  }

  private activity(today: string, cuts: Cut[]) {
    const cached = this.pendingActivity;
    if (cached?.key === today && cached.expires > Date.now())
      return cached.value;
    const value = this.loadActivity(cuts);
    this.pendingActivity = { key: today, expires: Infinity, value };
    value.then(
      () => {
        if (this.pendingActivity?.value === value)
          this.pendingActivity.expires = Date.now() + 5 * 60000;
      },
      () => {
        if (this.pendingActivity?.value === value)
          this.pendingActivity.expires = Date.now() + 15000;
      },
    );
    return value;
  }

  // Share a single scan across dashboard requests and report its progress on cold starts.
  async status(now = new Date()) {
    const today = inventoryBusinessDay(now);
    const scan = this.activity(today, billingCuts(today));
    if (this.pendingActivity?.expires === Infinity) {
      const ready = await new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => resolve(false), 750);
        scan.then(
          () => {
            clearTimeout(timer);
            resolve(true);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
      if (!ready) return { state: 'preparing' as const, ...this.progress };
    }
    return { state: 'ready' as const, ...(await this.overview(now)) };
  }

  async overview(now = new Date()) {
    const today = inventoryBusinessDay(now);
    const cuts = billingCuts(today);
    // Only the latest revision counts. Extract dates instead of transferring
    // complete historical snapshots for every annex to the dashboard.
    const activity = await this.activity(today, cuts);
    const [sites, documents] = await Promise.all([
      this.db.customerWorksite.findMany({
        select: {
          id: true,
          alias: true,
          customer: { select: { id: true, name: true } },
          worksite: { select: { name: true } },
        },
      }),
      this.db.$queryRaw<Array<SavedCut & { siteId: string }>>`
        SELECT d.id, d."customerWorksiteId" AS "siteId",
               to_char(d."periodFrom",'YYYY-MM-DD') AS "from", to_char(d."periodTo",'YYYY-MM-DD') AS "to",
               to_char(r.through,'YYYY-MM-DD') AS through, NULLIF(btrim(r."invoiceNumber"),'') AS "invoiceNumber",
               CASE WHEN r."invoiceNumber" IS NULL THEN ARRAY[]::text[] ELSE ARRAY(
                 SELECT DISTINCT line->>'date' FROM jsonb_array_elements(COALESCE(r.result->'lines','[]')) line
               ) END AS "billedDays",
               (EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(r.input->'additionalCharges','[]')) charge
                         WHERE (charge->>'quantity')::numeric > 0) OR
                CASE WHEN jsonb_typeof(r.input#>'{transport,rows}')='array' THEN EXISTS (
                   SELECT 1 FROM jsonb_array_elements(r.input#>'{transport,rows}') trip WHERE (trip->>'quantity')::numeric > 0
                ) ELSE COALESCE((r.input#>>'{transport,outbound,quantity}')::numeric,0)>0
                    OR COALESCE((r.input#>>'{transport,return,quantity}')::numeric,0)>0 END) AS manual
        FROM "AnnexDraft" d JOIN "AnnexDraftRevision" r ON r."draftId"=d.id AND r.revision=d.revision
        WHERE d."periodTo" >= ${cuts[0].from}::date AND d."periodFrom" <= ${today}::date
        ORDER BY d."periodFrom" DESC, d."periodTo", d.id`,
    ]);
    const rows: Entry[] = [];
    const reviews: Array<Site & { cutFrom: string; cutTo: string }> = [];
    const bySite = new Map<string, SavedCut[]>();
    for (const doc of documents) {
      const group = bySite.get(doc.siteId) ?? [];
      group.push(doc);
      bySite.set(doc.siteId, group);
    }
    for (const site of sites) {
      const identity = {
        siteId: site.id,
        siteName: site.alias || site.worksite.name,
        customerId: site.customer.id,
        customerName: site.customer.name,
      };
      for (const cut of cuts) {
        const current = activity.get(site.id + '/' + cut.from);
        const saved = (bySite.get(site.id) ?? []).filter(
          (doc) => doc.from <= cut.through && doc.to >= cut.from,
        );
        if (current?.review)
          reviews.push({ ...identity, cutFrom: cut.from, cutTo: cut.to });
        for (const row of classifyBillingCut(
          cut,
          new Set(current?.days),
          saved,
        )) {
          rows.push({ ...identity, cutFrom: cut.from, cutTo: cut.to, ...row });
        }
      }
    }
    rows.sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.customerName.localeCompare(b.customerName, 'es') ||
        a.siteName.localeCompare(b.siteName, 'es'),
    );
    return { today, cuts, rows, reviews };
  }
}
