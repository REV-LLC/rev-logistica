export type InventoryDatePrecision = 'DAY' | 'INSTANT';

const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function inventoryBusinessDay(value: Date): string {
  const parts = businessDayFormatter.formatToParts(value);
  const valueFor = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`;
}

/** Only an explicit, valid ISO calendar day proves that no hour was supplied. */
export function getInventoryDatePrecision(document: {
  docDate: Date;
  notes?: string | null;
}): InventoryDatePrecision {
  const entry = document.notes?.split('|').map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('fecha documento:'));
  const value = entry?.slice(entry.indexOf(':') + 1).trim();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'INSTANT';
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return 'INSTANT';
  }
  return inventoryBusinessDay(document.docDate) === value ? 'DAY' : 'INSTANT';
}

/** A date without an hour starts at its calendar lower bound, never at 07:00. */
export function inventoryEffectiveLowerBound(
  requested: Date,
  precision: InventoryDatePrecision,
): Date {
  return precision === 'DAY'
    ? new Date(`${inventoryBusinessDay(requested)}T05:00:00.000Z`)
    : requested;
}

/**
 * A DAY document is appended after the current state within its declared day.
 * This is a chronological lower bound, not an inferred physical arrival time.
 * appendOrder, allocated after row locks, breaks equal effectiveAt timestamps;
 * neither registration timestamps nor UUID order can reverse that append.
 * Null means this would backdate a precise instant or cross a business day.
 */
export function resolveSerializedEffectiveAt(
  requested: Date,
  latest: Date,
  precision: InventoryDatePrecision,
): Date | null {
  const lowerBound = inventoryEffectiveLowerBound(requested, precision);
  if (latest.getTime() <= lowerBound.getTime()) return lowerBound;
  if (precision === 'DAY' && inventoryBusinessDay(lowerBound) === inventoryBusinessDay(latest)) {
    return latest;
  }
  return null;
}
