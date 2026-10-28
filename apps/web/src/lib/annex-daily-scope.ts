import type { AnnexInput } from "../app/billing/annexes/types";

export function isDailyAnnex(input: AnnexInput) {
  return (
    input.machineDays.length === 0 &&
    input.rentals.every((r) => {
      const unit = r.commercial?.mode?.unit ?? r.commercial?.catalog?.unit;
      return !r.metering && !r.cutting && (!unit || unit === "DAY");
    })
  );
}
