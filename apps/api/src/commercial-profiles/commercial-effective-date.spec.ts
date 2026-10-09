import { profileSchema } from './commercial-profile.input';

const input = {
  scopeType: 'ASSET', scopeId: '00000000-0000-4000-8000-000000000001', expectedVersion: 0,
  groups: [], modes: [{ id: '00000000-0000-4000-8000-000000000002', name: 'Alquiler', unit: 'DAY',
    minimum: { value: '1', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount: '100' }, conditions: [], parts: [] }],
};

describe('automatic commercial save date', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the server date in Bogotá rather than UTC or the browser date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T04:59:59Z'));
    expect(profileSchema.parse(input).effectiveFrom).toBe('2026-10-07');
  });

  it('computes the date for each save instead of caching the form-open date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T04:59:59Z'));
    expect(profileSchema.parse(input).effectiveFrom).toBe('2026-10-07');
    jest.setSystemTime(new Date('2026-10-08T05:00:00Z'));
    expect(profileSchema.parse(input).effectiveFrom).toBe('2026-10-08');
  });

  it('preserves explicit dates for existing historical/import callers, rejecting impossible dates', () => {
    expect(profileSchema.parse({ ...input, effectiveFrom: '2026-09-30' }).effectiveFrom).toBe('2026-09-30');
    expect(profileSchema.safeParse({ ...input, effectiveFrom: '2026-02-30' }).success).toBe(false);
  });
});
