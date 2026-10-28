import { BadRequestException } from '@nestjs/common';
import { AnnexInput, parseAnnexInput } from './annex-input';

type Rental = AnnexInput['rentals'][number];
export const DAILY_SCOPE_MESSAGE =
  'Esta versión de anexos solo admite alquileres por día, sin reportes de operario ni mediciones por hora o metro.';

export function isDailyRental(rental: Rental) {
  const unit =
    rental.commercial?.mode?.unit ?? rental.commercial?.catalog?.unit;
  return !rental.metering && !rental.cutting && (!unit || unit === 'DAY');
}

/** Scope new calculations without rewriting any saved revision or commercial snapshot. */
export function dailyRentals(
  rentals: Rental[],
  machineDays: AnnexInput['machineDays'],
) {
  const excluded = new Set(rentals.filter((r) => !isDailyRental(r)));
  const matches = (
    r: Rental,
    part: NonNullable<Rental['commercial']>['parts'][number],
  ) =>
    Boolean(
      (r.commercial?.contextualZero || r.includedIn) &&
      ((part.assetId && r.assetId === part.assetId) ||
        (part.accessoryId && r.accessoryId === part.accessoryId) ||
        (!part.assetId &&
          !part.accessoryId &&
          part.skuId &&
          r.skuId === part.skuId)),
    );
  // Included pieces must not remain as orphan zero-price rows of an excluded machine.
  let changed = true;
  while (changed) {
    changed = false;
    const parents = [...machineDays, ...excluded];
    for (const rental of rentals) {
      if (excluded.has(rental)) continue;
      if (
        parents.some((parent) => {
          const from = rental.commercialInterval?.from ?? rental.deliveredOn;
          const to = rental.commercialInterval?.to ?? '9999-12-31';
          const parentFrom =
            'date' in parent
              ? parent.date
              : (parent.commercialInterval?.from ?? parent.deliveredOn);
          const parentTo =
            'date' in parent
              ? parent.date
              : (parent.commercialInterval?.to ?? '9999-12-31');
          if (parentTo < from || parentFrom > to) return false;
          return (
            (rental.includedIn &&
              rental.includedIn.assetId === parent.assetId) ||
            parent.commercial?.parts.some(
              (part) => part.treatment === 'INCLUDED' && matches(rental, part),
            )
          );
        })
      ) {
        excluded.add(rental);
        changed = true;
      }
    }
  }
  return {
    rentals: rentals.filter((r) => !excluded.has(r)),
    excluded: excluded.size + machineDays.length,
  };
}

export function assertDailyAnnex(value: unknown): AnnexInput {
  const input = parseAnnexInput(value);
  if (input.machineDays.length || input.rentals.some((r) => !isDailyRental(r)))
    throw new BadRequestException(DAILY_SCOPE_MESSAGE);
  return input;
}
