import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AnnexInput } from './annex-input';
import { isDailyRental } from './annex-daily-scope';

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

type Rental = AnnexInput['rentals'][number];
type WorksiteRate = NonNullable<AnnexInput['worksiteRates']>[number];

function rentalRateKey(rental: Rental) {
  return rental.skuId + ':' + (rental.billingAreaM2 === undefined ? 'UNIT' : 'AREA_M2');
}

function acceptsWorksiteRate(rental: Rental) {
  return isDailyRental(rental) && !rental.accessoryId && !rental.includedIn &&
    !rental.commercial?.contextualZero && rental.commercial?.status !== 'REVIEW' &&
    rental.commercial?.mode?.pricing.source !== 'FIXED';
}

export function validateWorksiteRates(input: AnnexInput, existing: WorksiteRate[] = []) {
  const eligible = new Set(input.rentals.filter(acceptsWorksiteRate).map(rentalRateKey));
  for (const rate of input.worksiteRates ?? []) {
    if (eligible.has(rate.skuId + ':' + rate.quantityBasis)) continue;
    // An existing decision can survive a corrected movement that removed the line.
    if (existing.some(old => old.skuId === rate.skuId && old.quantityBasis === rate.quantityBasis &&
      old.unitPrice === rate.unitPrice)) continue;
    throw new BadRequestException('Solo se puede fijar una tarifa de obra para una referencia de alquiler independiente de este anexo.');
  }
}

export function applyCustomerPricing(rentals: Rental[], value: unknown, priorCuts: Pick<AnnexInput, 'worksiteRates'>[] = []) {
  const parsed = value == null ? null : customerPricingSchema.safeParse(value);
  if (parsed && !parsed.success) throw new BadRequestException('La configuración de tarifas del cliente es inválida');
  const rates = new Map(parsed?.data.rates.map(rate => [`${rate.skuId}:${rate.quantityBasis}`, rate.unitPrice]));
  const worksite = new Map<string, string | null>();
  // Only the latest revision of each earlier cut at this site, newest cut first.
  for (const cut of priorCuts) {
    for (const rate of cut.worksiteRates ?? []) {
      const key = rate.skuId + ':' + rate.quantityBasis;
      if (!worksite.has(key)) worksite.set(key, rate.unitPrice);
    }
  }
  for (const rental of rentals) {
    const key = rentalRateKey(rental);
    const worksitePrice = acceptsWorksiteRate(rental) ? worksite.get(key) : undefined;
    const customerEligible = !rental.commercial && !rental.includedIn && !rental.metering && !rental.cutting;
    const agreed = worksitePrice ?? (customerEligible ? rates.get(key) : undefined);
    if (agreed === undefined) continue;
    const agreedPrice = new Prisma.Decimal(agreed);
    // Preserve a catalog base above the agreement so the reduction remains visible.
    // An explicit customer tariff is also valid when the catalog has no usable price.
    const base = Prisma.Decimal.max(rental.pricing.basePrice, agreedPrice);
    rental.pricing = {
      basePrice: base.toFixed(2), effectivePrice: agreedPrice.toFixed(2),
      adjustmentReason: worksitePrice != null ? 'Tarifa acordada para la obra' : 'Tarifa acordada para el cliente',
      adjustmentSource: worksitePrice != null ? 'WORKSITE' : 'CUSTOMER',
    };
  }
}
