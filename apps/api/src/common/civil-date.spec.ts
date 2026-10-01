import { civilDate } from './civil-date';

describe('civil date validation independent of business modules', () => {
  it.each(['2026-09-30', '2026-10-01', '2028-02-29', '2027-01-01'])('accepts real civil date %s', date => {
    expect(civilDate(date).toISOString()).toBe(`${date}T00:00:00.000Z`);
  });
  it.each(['2026-02-29', '2026-09-31', '2026-13-01', '2026-00-01', '2026-10-00', 'bad', '2026-1-1'])('rejects invalid civil date %s', date => {
    expect(() => civilDate(date)).toThrow('Fecha inválida');
  });
});
