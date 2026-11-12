import { BadRequestException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { getWorksiteQuantityDelta } from './worksite-ledger-balance';

export type LossAllocation = { deliveryId: string; quantity: string };
type Row = { id: string; effectiveAt: Date; quantity: Prisma.Decimal; movementType: MovementType };

/** Insert the loss into the full physical timeline, protecting later returns too. */
export function planWorksiteLoss(rows: Row[], effectiveAt: Date, quantity: Prisma.Decimal): LossAllocation[] {
  const lots: Array<{ id: string; remaining: Prisma.Decimal }> = [];
  const allocations: LossAllocation[] = [];
  const events = [...rows.map(row => ({ row, loss: false })), {
    row: { id: 'new-loss', effectiveAt, quantity, movementType: MovementType.LOSS }, loss: true,
  }].sort((a, b) => a.row.effectiveAt.getTime() - b.row.effectiveAt.getTime());
  for (const { row, loss } of events) {
    const delta = new Prisma.Decimal(getWorksiteQuantityDelta(row.movementType, Number(row.quantity)));
    if (delta.gt(0)) {
      lots.push({ id: row.id, remaining: delta });
      continue;
    }
    let remaining = delta.negated();
    for (const lot of lots) {
      const amount = Prisma.Decimal.min(lot.remaining, remaining);
      if (amount.lte(0)) continue;
      lot.remaining = lot.remaining.minus(amount);
      remaining = remaining.minus(amount);
      if (loss) allocations.push({ deliveryId: lot.id, quantity: amount.toString() });
    }
    if (remaining.gt(0)) throw new BadRequestException('La pérdida supera el saldo de la obra en esa fecha o dejaría una devolución posterior sin existencias');
  }
  return allocations;
}
