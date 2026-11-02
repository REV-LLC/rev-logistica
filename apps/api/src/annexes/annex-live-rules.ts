import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isDailyRental } from './annex-daily-scope';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
import type { SourceIssue } from './annex-inventory';
import { selectAnnexMode } from './annex-mode-selection';

type Pricing = AnnexInput['rentals'][number]['pricing'];
function manualPricing(pricing: Pricing) {
  if (pricing.adjustmentSource) return pricing.adjustmentSource === 'MANUAL';
  // Compatibility for saved configurations created before provenance was recorded.
  if (pricing.discountPercent !== undefined) return true;
  return (
    pricing.effectivePrice !== undefined &&
    pricing.adjustmentReason !== 'Tarifa acordada para el cliente'
  );
}

/** Reapply saved decisions to current data. Saved quantities, dates and results never replace the ledger. */
export function applySavedAnnexRules(fresh: AnnexInput, saved: AnnexInput) {
  if (
    saved.machineDays.length ||
    saved.rentals.some((r) => !isDailyRental(r))
  ) {
    throw new BadRequestException(
      'Este anexo histórico contiene modalidades que no están habilitadas para consulta en vivo',
    );
  }
  let input = structuredClone(fresh);
  const issues: SourceIssue[] = [];
  const oldLots = new Map(saved.rentals.map((r) => [r.id, r]));
  for (const old of saved.rentals) {
    const modeId = old.commercial?.selectedModeId;
    const current = input.rentals.find((r) => r.id === old.id);
    if (modeId && current && current.commercial?.selectedModeId !== modeId) {
      input = selectAnnexMode({ input, rentalId: current.id, modeId });
    }
  }
  input.observations = saved.observations;
  input.transport = structuredClone(saved.transport);
  input.additionalCharges = structuredClone(saved.additionalCharges);
  input.policy = {
    ...input.policy,
    ...saved.policy,
    minimumDaysByRental: {
      ...input.policy.minimumDaysByRental,
      ...saved.policy.minimumDaysByRental,
    },
    minimumDaysBySku: {
      ...input.policy.minimumDaysBySku,
      ...saved.policy.minimumDaysBySku,
    },
    minimumHoursByAsset: {
      ...input.policy.minimumHoursByAsset,
      ...saved.policy.minimumHoursByAsset,
    },
  };
  for (const rental of input.rentals) {
    const old = oldLots.get(rental.id);
    if (!old) continue;
    if (
      manualPricing(old.pricing) &&
      !rental.includedIn &&
      !rental.commercial?.contextualZero
    ) {
      const base =
        old.pricing.effectivePrice === undefined
          ? rental.pricing.basePrice
          : Prisma.Decimal.max(
              rental.pricing.basePrice,
              old.pricing.effectivePrice,
            ).toFixed(2);
      rental.pricing = {
        basePrice: base,
        adjustmentSource: 'MANUAL',
        ...(old.pricing.adjustmentReason
          ? { adjustmentReason: old.pricing.adjustmentReason }
          : {}),
        ...(old.pricing.discountPercent !== undefined
          ? { discountPercent: old.pricing.discountPercent }
          : {}),
        ...(old.pricing.effectivePrice !== undefined
          ? { effectivePrice: old.pricing.effectivePrice }
          : {}),
      };
    }
    rental.waivedDays = old.waivedDays.filter(
      (d) => d.date >= input.period.from && d.date <= input.period.through,
    );
    rental.modeArchive = structuredClone(old.modeArchive);
  }
  // A manual day adjustment is valid only for its original quantity and dates.
  // Changed inventory must still be shown; surface an explicit review notice for an obsolete adjustment.
  const currentLines = calculateAnnex(input).lines;
  for (const rental of input.rentals) {
    const adjustments = oldLots.get(rental.id)?.dayAdjustments ?? [];
    rental.dayAdjustments = [];
    for (const adjustment of adjustments) {
      const lines = currentLines.filter(
        (l) =>
          l.key.startsWith(`${rental.id}:`) &&
          !l.key.includes(':minimum:') &&
          l.date >= adjustment.from &&
          l.date <= adjustment.to,
      );
      const days =
        (Date.parse(adjustment.to) - Date.parse(adjustment.from)) / 86400000 +
        1;
      if (
        adjustment.from >= input.period.from &&
        adjustment.to <= input.period.through &&
        lines.length === days &&
        lines.every(
          (l) =>
            !l.waived && new Prisma.Decimal(l.quantity).eq(adjustment.quantity),
        )
      ) {
        rental.dayAdjustments.push(structuredClone(adjustment));
      } else {
        issues.push({
          code: 'SAVED_DAY_ADJUSTMENT_REVIEW',
          reference: rental.id,
          message: `Revisa el ajuste manual de ${rental.label} (${adjustment.from} a ${adjustment.to}): cambiaron sus cantidades o fechas. Se muestra el cálculo actualizado sin ese ajuste.`,
        });
      }
    }
  }
  return { input, issues };
}
