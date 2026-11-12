import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import type { AnnexInput } from './annex-input';

const allocationsSchema = z.array(z.object({ deliveryId: z.string(), quantity: z.string() }).strict());
type Loss = { id: string; ledgerId: string; skuId: string; assetId: string | null; effectiveAt: Date; allocations: Prisma.JsonValue };

/** Only persisted physical losses can supply authoritative rental cutoffs. */
export function applyInventoryLosses(input: AnnexInput, losses: Loss[]) {
  const ids = new Set(losses.map(loss => loss.ledgerId));
  for (const rental of input.rentals) rental.returns = rental.returns.filter(event => !ids.has(event.source.reference) && !event.loss);
  for (const loss of losses) {
    const date = inventoryBusinessDay(loss.effectiveAt);
    for (const allocation of allocationsSchema.parse(loss.allocations)) {
      for (const rental of input.rentals) {
        if (rental.skuId !== loss.skuId || (rental.assetId ?? null) !== loss.assetId || rental.source.reference !== allocation.deliveryId) continue;
        if (date < rental.deliveredOn) throw new BadRequestException('La pérdida es anterior a la entrega del anexo');
        rental.returns.push({ date, quantity: allocation.quantity, loss: true, source: { reference: loss.ledgerId, origin: 'INVENTORY' } });
      }
    }
  }
  return input;
}
