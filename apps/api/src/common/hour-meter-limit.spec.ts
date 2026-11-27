import { Prisma } from '@prisma/client';
import { assertHourMeterIncrease } from './hour-meter-limit';
const date = (value: string) => new Date(value + '-05:00');
function fixture(values: [number | string, string][], vehicle = false) {
  const rows = values.map(([hours, at]) => ({ hours: new Prisma.Decimal(hours), recordedAt: date(at) }));
  const findFirst = jest.fn(async ({ where, orderBy }) => {
    const filter = where.recordedAt;
    const matching = rows.filter(r => !filter || ((!filter.gte || r.recordedAt >= filter.gte)
      && (!filter.lte || r.recordedAt <= filter.lte) && (!filter.lt || r.recordedAt < filter.lt)));
    matching.sort((a, b) => (a.recordedAt.getTime() - b.recordedAt.getTime()) * (orderBy[0].recordedAt === 'asc' ? 1 : -1));
    return matching[0] ?? null;
  });
  const tx = { assetHourReading: { findFirst }, vehicleHourReading: { findFirst } } as never;
  return (hours: number, at = '2026-11-27T17:00:00', now = date('2026-11-30T23:00:00')) =>
    assertHourMeterIncrease(tx, vehicle ? { vehicleId: 'vehicle' } : { assetId: 'asset' }, values.at(-1)?.[0] ?? 0, hours, date(at), now);
}

describe('24 hour daily meter increase limit, Colombia business dates', () => {
  it.each([true, false])('rejects the Mini Case jump for vehicles=%s', async vehicle => {
    await expect(fixture([[699.9, '2026-11-26T19:10:00']], vehicle)(7007.5))
      .rejects.toMatchObject({ response: { code: 'HOUR_METER_DAILY_LIMIT' } });
  });
  it.each([707.5, 723.9])('accepts next-day readings up to 24 hours: %s', async hours => {
    await expect(fixture([[699.9, '2026-11-26T19:10:00']])(hours)).resolves.toBeUndefined();
  });
  it('rejects one hundredth over the daily maximum with exact decimals', async () => {
    await expect(fixture([[699.9, '2026-11-26T19:10:00']])(723.91)).rejects.toThrow('723.9 h');
  });
  it('allows up to 72 hours after three days, without allowing 72.01', async () => {
    const check = fixture([[643, '2026-11-24T17:00:00']]);
    await expect(check(715)).resolves.toBeUndefined();
    await expect(check(715.01)).rejects.toThrow('715 h');
  });
  it('counts the cumulative daily increase across multiple submissions', async () => {
    const check = fixture([[100, '2026-11-26T18:00:00'], [120, '2026-11-27T09:00:00']]);
    await expect(check(124)).resolves.toBeUndefined();
    await expect(check(125)).rejects.toThrow('124 h');
  });
  it('uses the first same-day reading if there is no earlier day in history', async () => {
    const check = fixture([[100, '2026-11-27T08:00:00'], [120, '2026-11-27T09:00:00']]);
    await expect(check(124)).resolves.toBeUndefined();
    await expect(check(144)).rejects.toThrow('124 h');
  });
  it('uses Colombia dates across UTC midnight and permits repeated unchanged readings', async () => {
    const check = fixture([[100, '2026-11-26T20:00:00'], [120, '2026-11-26T23:00:00']]);
    await expect(check(120, '2026-11-26T23:30:00')).resolves.toBeUndefined();
    await expect(check(125, '2026-11-26T23:30:00')).rejects.toThrow();
  });
  it('rejects future dates and backdated increases instead of allowing a date-based bypass', async () => {
    const check = fixture([[100, '2026-11-27T08:00:00']]);
    await expect(check(101, '2026-11-26T08:00:00')).rejects.toThrow('anterior');
    await expect(check(1000, '2027-01-01T08:00:00')).rejects.toThrow('futuro');
  });
  it('leaves a genuine initial reading without earlier meter history unrestricted', async () => {
    await expect(fixture([])(7000)).resolves.toBeUndefined();
  });
});
