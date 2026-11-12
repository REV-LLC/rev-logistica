import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import type { AnnexInput } from './annex-input';
import { returnBillingSlices } from './annex-return-cutoffs';
export type InventorySourceRow = {
  id: string;
  movementType: string;
  quantity: Prisma.Decimal;
  effectiveAt: Date;
  ownerWarehouseId: string;
  assetId: string | null;
  reversedByDocumentId: string | null;
  sku: {
    id: string;
    name: string;
    price: Prisma.Decimal | null;
    chargeType: string;
  } | null;
  document: {
    status: string;
    consecutive: string | null;
    id?: string;
    items?: Array<{
      skuId: string | null;
      assetId: string | null;
      condition: string | null;
      quantity: Prisma.Decimal | null;
      billingCutoffDate: Date | null;
    }>;
  } | null;
};
export type SourceIssue = { code: string; reference: string; message: string };
export function inventoryToAnnex(
  rows: InventorySourceRow[],
  period: AnnexInput['period'],
) {
  const issues: SourceIssue[] = [];
  const rentals: AnnexInput['rentals'] = [];
  const machineDays: AnnexInput['machineDays'] = [];
  const groups = new Map<string, InventorySourceRow[]>();
  const billingSlices = returnBillingSlices(rows);
  for (const row of rows) {
    const key = `${row.assetId ?? row.sku?.id ?? row.id}:${row.ownerWarehouseId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const lots: Array<{
      input: AnnexInput['rentals'][number];
      remaining: Prisma.Decimal;
    }> = [];
    let problem: string | null = null;
    for (const row of group) {
      const date = inventoryBusinessDay(row.effectiveAt);
      const sku = row.sku;
      if (!sku) {
        problem = 'Movimiento sin referencia de catálogo';
        break;
      }
      if (row.reversedByDocumentId) {
        problem =
          'El historial contiene anulaciones; requiere conciliación antes de cobrar';
        break;
      }
      if (row.document && row.document.status !== 'CONFIRMED') {
        problem = 'Movimiento asociado a un documento no confirmado';
        break;
      }
      if (!['OUT', 'ON_SITE', 'IN', 'TRANSIT', 'LOSS'].includes(row.movementType)) {
        problem = 'Movimiento de ajuste en obra pendiente de conciliación';
        break;
      }
      const quantity = row.quantity;
      const delta =
        row.movementType === 'ON_SITE' ? quantity : quantity.negated();
      if (quantity.isZero()) continue;
      const entering =
        row.movementType === 'OUT' || row.movementType === 'ON_SITE';
      if ((entering && delta.lte(0)) || (!entering && delta.gte(0))) {
        problem = 'Movimiento compensatorio o cantidad con signo inesperado';
        break;
      }
      if (entering) {
        if (
          row.assetId &&
          (!delta.eq(1) || lots.some((l) => l.remaining.gt(0)))
        ) {
          problem =
            'Activo con entradas simultáneas o cantidad distinta de uno';
          break;
        }
        lots.push({
          remaining: delta,
          input: {
            id: row.id,
            skuId: sku.id,
            label: sku.name,
            ...(row.assetId ? { assetId: row.assetId } : {}),
            deliveredOn: date,
            quantity: delta.toString(),
            source: { reference: row.id, origin: 'INVENTORY' },
            returns: [],
            waivedDays: [],
            pricing: { basePrice: sku.price?.toFixed(2) ?? '0' },
          },
        });
      } else {
        const slices = billingSlices.get(row.id) ?? [
          { quantity: delta.negated(), cutoff: undefined },
        ];
        for (const slice of slices) {
          let remaining = slice.quantity;
          for (const lot of lots) {
            if (remaining.isZero()) break;
            const amount = Prisma.Decimal.min(lot.remaining, remaining);
            if (amount.isZero()) continue;
            if (slice.cutoff && slice.cutoff < lot.input.deliveredOn) {
              throw new BadRequestException(
                `El corte de ${row.document?.consecutive ?? 'la devolución'} para ${sku.name} es anterior a la entrega`,
              );
            }
            lot.remaining = lot.remaining.minus(amount);
            remaining = remaining.minus(amount);
            lot.input.returns.push({
              date,
              ...(row.movementType === 'LOSS' ? { loss: true } : {}),
              ...(slice.cutoff ? { billingCutoffDate: slice.cutoff } : {}),
              quantity: amount.toString(),
              source: {
                reference:
                  slices.length > 1
                    ? `${row.id}:cutoff:${slice.cutoff}`
                    : row.id,
                origin: 'INVENTORY',
              },
            });
          }
          if (remaining.gt(0)) {
            problem = 'Devolución sin saldo de origen suficiente';
            break;
          }
        }
        if (problem) break;
      }
    }
    if (problem) {
      issues.push({
        code: 'INVENTORY_REVIEW',
        reference: key,
        message: problem,
      });
      continue;
    }
    const sku = group[0]?.sku;
    if (!sku) continue;
    const relevant = lots.filter(
      (l) =>
        l.input.deliveredOn <= period.through &&
        (l.remaining.gt(0) ||
          l.input.returns.some(
            (r) => (r.billingCutoffDate ?? r.date) >= period.from,
          )),
    );
    if (!relevant.length) continue;
    if (sku.price?.lt(0)) {
      issues.push({
        code: 'PRICE_INVALID',
        reference: sku.id,
        message: `${sku.name}: la tarifa base no puede ser negativa`,
      });
      continue;
    }
    if (sku.chargeType === 'HOUR') {
      const assetId = group[0].assetId;
      if (!assetId) {
        issues.push({
          code: 'MACHINE_REQUIRED',
          reference: key,
          message: `${sku.name}: el cobro horario requiere identificar la máquina`,
        });
        continue;
      }
      const dates = new Set<string>();
      for (const lot of relevant) {
        const end = lot.remaining.gt(0)
          ? period.through
          : lot.input.returns[lot.input.returns.length - 1].date;
        for (
          let time = Date.parse(
            `${lot.input.deliveredOn < period.from ? period.from : lot.input.deliveredOn}T00:00:00Z`,
          );
          time <=
          Date.parse(
            `${end < period.through ? end : period.through}T00:00:00Z`,
          );
          time += 86400000
        )
          dates.add(new Date(time).toISOString().slice(0, 10));
      }
      for (const date of [...dates].sort())
        machineDays.push({
          assetId,
          label: sku.name,
          date,
          status: 'PENDING',
          reports: [],
          pricing: { basePrice: sku.price?.toFixed(2) ?? '0' },
        });
    } else if (sku.chargeType === 'DAY') {
      const occupied = new Set<string>();
      let overlap = false;
      for (const lot of relevant) {
        if (!lot.input.assetId) continue;
        const end = lot.remaining.gt(0)
          ? period.through
          : lot.input.returns
              .map((r) => r.billingCutoffDate ?? r.date)
              .sort()
              .at(-1)!;
        for (
          let time = Date.parse(
            `${lot.input.deliveredOn < period.from ? period.from : lot.input.deliveredOn}T00:00:00Z`,
          );
          time <=
          Date.parse(
            `${end < period.through ? end : period.through}T00:00:00Z`,
          );
          time += 86400000
        ) {
          const date = String(time);
          if (occupied.has(date)) overlap = true;
          occupied.add(date);
        }
      }
      if (overlap)
        issues.push({
          code: 'SAME_DAY_RENTALS',
          reference: key,
          message: `${sku.name}: devolución y nueva entrega del activo el mismo día; revisar distribución del cobro`,
        });
      else rentals.push(...relevant.map((l) => l.input));
    } else
      issues.push({
        code: 'CHARGE_TYPE',
        reference: key,
        message: `${sku.name}: modalidad de cobro no soportada`,
      });
  }
  return { rentals, machineDays, issues };
}
