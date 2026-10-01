import type { AnnexInput } from './annex-input';

export const worksiteMinimumKey = (id: string) =>
  `annex-minimums:worksite:${id}`;
export type MinimumSettings = {
  days: Record<string, number>;
  hours: Record<string, string>;
};
export function minimumSettings(value: unknown): MinimumSettings {
  const result: MinimumSettings = { days: {}, hours: {} };
  if (!value || typeof value !== 'object') return result;
  const record = value as MinimumSettings;
  for (const [key, number] of Object.entries(record.days ?? {}))
    if (Number.isInteger(number) && number >= 0 && number <= 999)
      result.days[key] = number;
  for (const [key, number] of Object.entries(record.hours ?? {}))
    if (
      typeof number === 'string' &&
      /^\d{1,2}(\.\d{1,6})?$/.test(number) &&
      Number(number) <= 24
    )
      result.hours[key] = number;
  return result;
}
export function resolveMinimums(
  general: MinimumSettings,
  site: MinimumSettings,
  previous?: AnnexInput['policy'],
): MinimumSettings {
  return {
    days: { ...general.days, ...site.days, ...previous?.minimumDaysBySku },
    hours: {
      ...general.hours,
      ...site.hours,
      ...previous?.minimumHoursByAsset,
    },
  };
}
export function previousFortnight(from: string) {
  const date = new Date(`${from}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(day > 15 ? 15 : 0);
  const to = date.toISOString().slice(0, 10);
  date.setUTCDate(day > 15 ? 1 : 16);
  return { from: date.toISOString().slice(0, 10), to };
}
