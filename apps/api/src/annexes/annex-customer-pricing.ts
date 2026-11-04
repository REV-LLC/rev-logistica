import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AnnexInput } from './annex-input';
import { isDailyRental } from './annex-daily-scope';
import { price } from './annex-engine';
import { manualPricing } from './annex-live-rules';

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
      old.unitPrice === rate.unitPrice && old.thisCutOnly === rate.thisCutOnly &&
      JSON.stringify(old.tablePrice) === JSON.stringify(rate.tablePrice))) continue;
    throw new BadRequestException('Solo se puede fijar una tarifa de obra para una referencia de alquiler independiente de este anexo.');
  }
}

type PriorCut = Pick<AnnexInput, 'worksiteRates'> & Partial<Pick<AnnexInput, 'rentals'>>;

function latestWorksiteRates(priorCuts: PriorCut[]) {
  const latest = new Map<string, WorksiteRate>();
  for (const cut of priorCuts) {
    const chosen = new Set<string>();
    for (const rate of cut.worksiteRates ?? []) {
      const key = rate.skuId + ':' + rate.quantityBasis;
      chosen.add(key);
      if (!rate.thisCutOnly && !latest.has(key)) latest.set(key, rate);
    }
    // Older revisions have no edit order. Recover a manual rate only when the
    // edited lots of that reference agree. Never choose by ledger array order.
    const legacy = new Map<string, WorksiteRate | null>();
    for (const rental of cut.rentals ?? []) {
      const key = rentalRateKey(rental);
      if (latest.has(key) || chosen.has(key) || !acceptsWorksiteRate(rental) || !manualPricing(rental.pricing)) continue;
      const prior = legacy.get(key);
      if (prior === null) continue;
      if (prior?.tablePrice && !price(prior.tablePrice).effective.equals(price(rental.pricing).effective)) {
        legacy.set(key, null);
      } else {
        legacy.set(key, {skuId: rental.skuId, quantityBasis: rental.billingAreaM2 === undefined ? 'UNIT' : 'AREA_M2',
          unitPrice: null, tablePrice: rental.pricing});
      }
    }
    for (const [key, rate] of legacy) if (rate) latest.set(key, rate);
  }
  return latest;
}

export function applyCustomerPricing(rentals: Rental[], value: unknown, priorCuts: PriorCut[] = [], savedRentals: Rental[] = []) {
  const parsed = value == null ? null : customerPricingSchema.safeParse(value);
  if (parsed && !parsed.success) throw new BadRequestException('La configuración de tarifas del cliente es inválida');
  const rates = new Map(parsed?.data.rates.map(rate => [`${rate.skuId}:${rate.quantityBasis}`, rate.unitPrice]));
  const worksite = latestWorksiteRates(priorCuts);
  const savedLots = new Map(savedRentals.map(rental => [rental.id, rental]));
  for (const rental of rentals) {
    const key = rentalRateKey(rental);
    const rate = acceptsWorksiteRate(rental) ? worksite.get(key) : undefined;
    let worksitePrice = rate?.unitPrice;
    if (rate?.tablePrice) {
      const saved = savedLots.get(rental.id);
      if (saved && rentalRateKey(saved) === key) {
        // Automatic inheritance initializes new lines. Don't retrofit a price
        // into a line already saved before this feature or before a later edit.
        if (saved.pricing.adjustmentSource === 'WORKSITE') {
          rental.pricing = { ...saved.pricing };
          continue;
        }
      } else {
        const effective = price(rate.tablePrice).effective;
        if (effective.decimalPlaces() > 2) {
          // Keep the exact negotiated unit rate when a percentage produced
          // fractions of a cent. Rounding here changes multi-unit/day totals.
          rental.pricing = {basePrice: rate.tablePrice.basePrice, discountPercent: rate.tablePrice.discountPercent,
            adjustmentReason: 'Tarifa acordada para la obra', adjustmentSource: 'WORKSITE'};
          continue;
        }
        worksitePrice = effective.toFixed(2);
      }
    }
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
