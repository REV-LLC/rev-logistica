import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { civilDate } from '../payroll/payroll-policy';
import { applyCommercialComposition } from './annex-commercial-source';
import { inventoryToAnnex } from './annex-inventory';
import type { AnnexInput } from './annex-input';
import { calculateAnnex } from './annex-engine';
import { annexInputSchema } from './annex-input';
import {
  worksiteMinimumKey,
  minimumSettings,
  resolveMinimums,
  previousFortnight,
} from './annex-minimums';
@Injectable()
export class AnnexSourceService {
  constructor(private readonly prisma: PrismaService) {}
  async prepare(
    customerWorksiteId: string,
    from: string,
    to: string,
    through: string,
  ) {
    if (!z.string().uuid().safeParse(customerWorksiteId).success)
      throw new BadRequestException('Obra inválida');
    [from, to, through].forEach(civilDate);
    const period = { from, to, through };
    const policy: AnnexInput['policy'] = {
      version: 'REV-INITIAL-1',
      includeReturnDay: true,
      excludedWeekdays: [],
      excludeHolidays: false,
      holidays: [],
      holidayCalendarConfirmed: false,
      minimumHoursPerMachineDay: '6',
    };
    calculateAnnex({ period, policy, rentals: [], machineDays: [] });
    return this.prisma.$transaction(
      async (tx) => {
        const site = await tx.customerWorksite.findUnique({
          where: { id: customerWorksiteId },
          select: {
            id: true,
            customer: { select: { name: true } },
            worksite: { select: { name: true } },
          },
        });
        if (!site) throw new NotFoundException('Obra no encontrada');
        const end = new Date(Date.parse(`${through}T05:00:00Z`) + 86400000);
        const rows = await tx.stockLedger.findMany({
          where: { customerWorksiteId, effectiveAt: { lt: end } },
          orderBy: [
            { effectiveAt: 'asc' },
            { appendOrder: { sort: 'asc', nulls: 'first' } },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          take: 50001,
          select: {
            id: true,
            refDocumentId: true,
            skuId: true,
            movementType: true,
            quantity: true,
            effectiveAt: true,
            ownerWarehouseId: true,
            assetId: true,
            reversedByDocumentId: true,
            sku: {
              select: {
                id: true,
                name: true,
                price: true,
                chargeType: true,
                minimumChargeHours: true,
                assetFamily: { select: { name: true } },
              },
            },
            asset: {
              select: {
                sku: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    chargeType: true,
                    minimumChargeHours: true,
                    assetFamily: { select: { name: true } },
                  },
                },
              },
            },
            document: { select: { status: true, consecutive: true } },
          },
        });
        if (rows.length > 50000)
          throw new BadRequestException(
            'El historial excede el límite de preparación; requiere procesamiento por lotes',
          );
        const source = inventoryToAnnex(
          rows.map((row) => ({
            ...row,
            sku:
              (row.asset?.sku ?? row.sku)
                ? { ...(row.asset?.sku ?? row.sku)!, chargeType: 'DAY' }
                : null,
          })),
          period,
        );
        const cuts = await tx.documentItem.count({
          where: {
            document: { customerWorksiteId, docDate: { lt: end } },
            OR: [
              { billingCutoffDate: { not: null } },
              { returnedAt: { not: null } },
            ],
          },
        });
        if (cuts)
          source.issues.push({
            code: 'COMMERCIAL_CUTS',
            reference: site.id,
            message:
              'Hay cortes/devoluciones por ítem que requieren conciliarse con el historial físico antes de cobrar',
          });
        source.issues.push({
          code: 'CATALOG_PRICE_REVIEW',
          reference: site.id,
          message:
            'Tarifas tomadas del catálogo actual. Revisa su vigencia para este período',
        });
        const [saved, setting] = await Promise.all([
          tx.annexDraft.findMany({
            where: {
              customerWorksiteId,
              periodTo: { lt: new Date(`${from}T00:00:00Z`) },
            },
            orderBy: { periodFrom: 'desc' },
            include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } },
          }),
          tx.appSetting.findUnique({
            where: { key: worksiteMinimumKey(customerWorksiteId) },
          }),
        ]);
        const history = saved.flatMap((draft) => {
          const parsed = annexInputSchema.safeParse(draft.revisions[0]?.input);
          return parsed.success
            ? [
                {
                  input: parsed.data,
                  result: draft.revisions[0].result as unknown as ReturnType<
                    typeof calculateAnnex
                  >,
                },
              ]
            : [];
        });
        const priorCut = previousFortnight(from);
        const previous = history.find((h) => h.input.period.to === priorCut.to);
        const general = {
          days: {} as Record<string, number>,
          hours: {} as Record<string, string>,
        };
        const commercial = await applyCommercialComposition(
          tx,
          source.rentals,
          rows,
          period,
          customerWorksiteId,
          history.map((h) => h.input),
        );
        source.rentals = commercial.rentals;
        source.machineDays = commercial.machineDays;
        source.issues.push(...commercial.issues);
        policy.minimumDaysByRental = {};
        const reconstructedRentals: string[] = [];
        for (const rental of source.rentals) {
          if (rental.commercial?.mode?.unit === 'DAY') {
            const previousLot = previous?.input.rentals.find(
              (r) =>
                (r.assetId
                  ? r.assetId === rental.assetId
                  : r.skuId === rental.skuId) &&
                r.commercial?.mode?.id === rental.commercial?.mode?.id,
            );
            const siteSettings = minimumSettings(setting?.value);
            policy.minimumDaysByRental[rental.id] = previousLot
              ? (previous?.input.policy.minimumDaysByRental?.[previousLot.id] ??
                Number(rental.commercial.mode.minimum.value))
              : (siteSettings.days[
                  `${rental.assetId ?? rental.skuId}:${rental.commercial.mode.id}:DAY`
                ] ??
                siteSettings.days[rental.skuId] ??
                Number(rental.commercial.mode.minimum.value));
          }
          // Preserve actual saved day overrides. Uncovered dates are reconstructed
          // from physical presence and marked for reconciliation, never silently certified.
          let priorDays = new Prisma.Decimal(0),
            reconstructed = false;
          for (
            let time = Date.parse(rental.deliveredOn + 'T00:00:00Z');
            time < Date.parse(from + 'T00:00:00Z');
            time += 86400000
          ) {
            const date = new Date(time).toISOString().slice(0, 10);
            const cut = history.find(
              (h) =>
                h.input.period.from <= date && h.input.period.through >= date,
            );
            if (cut) {
              const line = cut.result.lines.find(
                (l) => l.key === `${rental.id}:${date}` && l.kind === 'DAY',
              );
              if (line && !line.waived)
                priorDays = priorDays.plus(line.billableUnits);
            } else {
              reconstructed = true;
              if (!policy.excludedWeekdays.includes(new Date(time).getUTCDay()))
                priorDays = priorDays.plus(1);
            }
          }
          rental.priorBillableDays = priorDays.toString();
          if (reconstructed) reconstructedRentals.push(rental.id);
        }
        const siteMinimums = minimumSettings(setting?.value);
        for (const day of source.machineDays) {
          const previousDay = previous?.input.machineDays.find(
            (d) =>
              d.assetId === day.assetId &&
              (!d.commercial?.mode ||
                d.commercial.mode.id === day.commercial?.mode?.id),
          );
          general.hours[day.assetId] =
            (previousDay
              ? previous?.input.policy.minimumHoursByAsset?.[day.assetId]
              : undefined) ??
            siteMinimums.hours[
              `${day.assetId}:${day.commercial?.mode?.id}:HOUR`
            ] ??
            siteMinimums.hours[day.assetId] ??
            day.commercial?.mode?.minimum.value ??
            '0';
        }
        const resolved = { days: siteMinimums.days, hours: general.hours };
        for (const rental of source.rentals) {
          if (
            reconstructedRentals.includes(rental.id) &&
            policy.minimumDaysByRental?.[rental.id]
          )
            source.issues.push({
              code: 'MINIMUM_HISTORY_RECONSTRUCTED',
              reference: rental.id,
              message:
                'Días anteriores reconstruidos del inventario: confirma los acuerdos y cobros anteriores antes de facturar',
            });
        }
        policy.minimumDaysBySku = resolved.days;
        policy.minimumHoursByAsset = resolved.hours;
        const input: AnnexInput = {
          period,
          policy,
          rentals: source.rentals,
          machineDays: source.machineDays,
        };
        return {
          site,
          input,
          result: calculateAnnex(input),
          sourceIssues: source.issues,
          ledgerCount: rows.length,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
}
