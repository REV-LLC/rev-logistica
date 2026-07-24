import { addCalendarMonths } from './mobility-guides.service';

describe('addCalendarMonths', () => {
  it('preserves the calendar day for regular dates', () => {
    expect(addCalendarMonths(new Date('2026-07-15T12:00:00.000Z'), 1).toISOString()).toBe(
      '2026-08-15T12:00:00.000Z',
    );
  });

  it('uses the last valid day when the destination month is shorter', () => {
    expect(addCalendarMonths(new Date('2026-01-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('supports retention cutoffs in previous months', () => {
    expect(addCalendarMonths(new Date('2026-07-31T12:00:00.000Z'), -3).toISOString()).toBe(
      '2026-04-30T12:00:00.000Z',
    );
  });
});
