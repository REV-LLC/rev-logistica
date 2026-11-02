import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import type { InventorySourceRow } from './annex-inventory';

/** Match documentary billing dates without changing the physical ledger or its order. */
export function returnBillingSlices(rows: InventorySourceRow[]) {
  const result = new Map<
    string,
    Array<{ quantity: Prisma.Decimal; cutoff: string }>
  >();
  const groups = new Map<string, InventorySourceRow[]>();
  for (const row of rows) {
    if (
      !['IN', 'TRANSIT'].includes(row.movementType) ||
      !row.document?.items?.some((i) => i.billingCutoffDate)
    )
      continue;
    const key = `${row.document.id}:${row.assetId ?? row.sku?.id}:${row.ownerWarehouseId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const items = first.document!.items!.filter(
      (item) =>
        (first.assetId
          ? item.assetId === first.assetId
          : !item.assetId && item.skuId === first.sku?.id) &&
        (!item.condition || item.condition === first.ownerWarehouseId),
    );
    if (!items.some((i) => i.billingCutoffDate)) continue;
    const byDate = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      const cutoff = inventoryBusinessDay(
        item.billingCutoffDate ?? first.effectiveAt,
      );
      byDate.set(
        cutoff,
        (byDate.get(cutoff) ?? new Prisma.Decimal(0)).plus(
          item.assetId ? 1 : (item.quantity ?? 0),
        ),
      );
    }
    const expected = group.reduce(
      (n, row) => n.plus(row.quantity),
      new Prisma.Decimal(0),
    );
    const actual = [...byDate.values()].reduce(
      (n, qty) => n.plus(qty),
      new Prisma.Decimal(0),
    );
    const ambiguousOwner =
      items.some((i) => !i.condition) &&
      rows.some(
        (row) =>
          row.document?.id === first.document?.id &&
          row.ownerWarehouseId !== first.ownerWarehouseId &&
          (first.assetId
            ? row.assetId === first.assetId
            : !row.assetId && row.sku?.id === first.sku?.id) &&
          ['IN', 'TRANSIT'].includes(row.movementType),
      );
    if (
      ambiguousOwner ||
      !expected.eq(actual) ||
      [...byDate.values()].some((q) => q.lte(0))
    ) {
      throw new BadRequestException(
        `No se pueden relacionar las cantidades y cortes de ${first.document?.consecutive ?? 'la devolución'} para ${first.sku?.name ?? 'el equipo'}`,
      );
    }
    const pending = [...byDate]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cutoff, quantity]) => ({ cutoff, quantity }));
    for (const row of group) {
      let remaining = row.quantity;
      const slices: Array<{ quantity: Prisma.Decimal; cutoff: string }> = [];
      for (const entry of pending) {
        if (remaining.isZero()) break;
        const quantity = Prisma.Decimal.min(remaining, entry.quantity);
        if (quantity.isZero()) continue;
        slices.push({ quantity, cutoff: entry.cutoff });
        entry.quantity = entry.quantity.minus(quantity);
        remaining = remaining.minus(quantity);
      }
      result.set(row.id, slices);
    }
  }
  return result;
}
