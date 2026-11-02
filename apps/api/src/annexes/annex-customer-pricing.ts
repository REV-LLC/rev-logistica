import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AnnexInput } from './annex-input';

export const customerPricingKey = (customerId: string) => `billing.annex.customer-pricing.${customerId}`;
export const customerPricingSchema = z.object({
  version: z.literal(1),
  rates: z.array(z.object({
    skuId: z.string().uuid(),
    quantityBasis: z.enum(['UNIT', 'AREA_M2']),
    unitPrice: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  }).strict()).max(2000),
}).strict().refine(value => new Set(value.rates.map(r => `${r.skuId}:${r.quantityBasis}`)).size === value.rates.length,
  'Tarifa de cliente duplicada');

export function applyCustomerPricing(rentals: AnnexInput['rentals'], value: unknown) {
  if (value == null) return;
  const parsed = customerPricingSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('La configuración de tarifas del cliente es inválida');
  const rates = new Map(parsed.data.rates.map(rate => [`${rate.skuId}:${rate.quantityBasis}`, rate.unitPrice]));
  for (const rental of rentals) {
    // Explicit documentary agreements and included pieces keep their own pricing.
    if (rental.commercial || rental.includedIn || rental.metering || rental.cutting) continue;
    const basis = rental.billingAreaM2 === undefined ? 'UNIT' : 'AREA_M2';
    const agreed = rates.get(`${rental.skuId}:${basis}`);
    if (agreed === undefined) continue;
    const agreedPrice = new Prisma.Decimal(agreed);
    // Preserve a catalog base above the agreement so the reduction remains visible.
    // An explicit customer tariff is also valid when the catalog has no usable price.
    const base = Prisma.Decimal.max(rental.pricing.basePrice, agreedPrice);
    rental.pricing = {
      basePrice: base.toFixed(2), effectivePrice: agreedPrice.toFixed(2),
      adjustmentReason: 'Tarifa acordada para el cliente',
    };
  }
}
