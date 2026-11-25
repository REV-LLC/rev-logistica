import { businessGreeting, sameBusinessDay } from './whatsapp-greeting';
describe('WhatsApp greetings in Colombia', () => {
  it.each([
    ['2026-11-25T04:59:59Z', 'Buenas tardes'],
    ['2026-11-25T05:00:00Z', 'Buenos días'],
    ['2026-11-25T16:59:59Z', 'Buenos días'],
    ['2026-11-25T17:00:00Z', 'Buenas tardes'],
    ['2026-11-26T04:59:59Z', 'Buenas tardes'],
  ])(
    'uses the requested morning/afternoon greeting at %s',
    (time, expected) => {
      expect(businessGreeting(new Date(time))).toBe(expected);
    },
  );
  it('compares the Colombian day instead of the server UTC day', () => {
    expect(
      sameBusinessDay(
        new Date('2026-11-25T23:00:00Z'),
        new Date('2026-11-26T04:59:59Z'),
      ),
    ).toBe(true);
    expect(
      sameBusinessDay(
        new Date('2026-11-26T04:59:59Z'),
        new Date('2026-11-26T05:00:00Z'),
      ),
    ).toBe(false);
  });
});
