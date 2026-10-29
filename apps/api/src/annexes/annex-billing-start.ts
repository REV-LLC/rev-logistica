import { z } from 'zod';
import { getInventoryDatePrecision, inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import type { AnnexInput } from './annex-input';

export const billingStartSettingKey = 'billing.annex.daily-start';
export const billingStartRuleSchema = z.object({
  afterLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.literal('America/Bogota'),
}).strict();

export function dailyBillingStartsOn(
  deliveredOn: string,
  document: { type: string; docDate: Date; notes?: string | null } | null,
  rule: z.infer<typeof billingStartRuleSchema> | null,
): string {
  if (!rule || !document || document.type !== 'REMISSION' ||
    getInventoryDatePrecision(document) === 'DAY' ||
    inventoryBusinessDay(document.docDate) !== deliveredOn) return deliveredOn;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: rule.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(document.docDate);
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const [hour, minute] = rule.afterLocalTime.split(':').map(Number);
  if (part('hour') * 3600 + part('minute') * 60 + part('second') <= hour * 3600 + minute * 60) return deliveredOn;
  return new Date(Date.parse(deliveredOn + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}

export function applyDailyBillingStart(
  rentals: AnnexInput['rentals'],
  rows: Array<{ id: string; document: { type: string; docDate: Date; notes?: string | null } | null }>,
  rule: z.infer<typeof billingStartRuleSchema> | null,
) {
  const documents = new Map(rows.map(row => [row.id, row.document]));
  for (const rental of rentals) {
    if (rental.metering || rental.cutting) continue;
    rental.billingStartsOn = dailyBillingStartsOn(rental.deliveredOn, documents.get(rental.source.reference) ?? null, rule);
  }
}
