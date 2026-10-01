import {
  resolveMinimums,
  previousFortnight,
  minimumSettings,
} from './annex-minimums';
import type { AnnexInput } from './annex-input';
describe('REV minimum defaults and precedence', () => {
  it('previous cut overrides worksite and equipment; zero is an explicit value', () => {
    expect(
      resolveMinimums(
        { days: { sku: 10, newSku: 3 }, hours: { asset: '6' } },
        { days: { sku: 8 }, hours: { asset: '4' } },
        {
          minimumDaysBySku: { sku: 0 },
          minimumHoursByAsset: { asset: '0' },
        } as AnnexInput['policy'],
      ),
    ).toEqual({ days: { sku: 0, newSku: 3 }, hours: { asset: '0' } });
  });
  it('gets the preceding fortnight including year transitions', () => {
    expect(previousFortnight('2026-09-16')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
    });
    expect(previousFortnight('2026-01-01')).toEqual({
      from: '2025-12-16',
      to: '2025-12-31',
    });
  });
  it('validates persisted settings', () => {
    expect(
      minimumSettings({
        days: { good: 0, bad: -1 },
        hours: { good: '3', bad: '25' },
      }),
    ).toEqual({ days: { good: 0 }, hours: { good: '3' } });
  });
});
