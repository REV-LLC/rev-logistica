import { Prisma } from '@prisma/client';
import { parentCoversRental } from './annex-commercial-source';
import type { AnnexInput } from './annex-input';
const lot: AnnexInput['rentals'][number] = {
  id: 'lot',
  skuId: 'sku',
  label: 'Implemento',
  deliveredOn: '2026-09-15',
  quantity: '1',
  returns: [],
  source: { reference: 'remission', origin: 'INVENTORY' },
  pricing: { basePrice: '100' },
  waivedDays: [],
};
const move = (date: string, type: string, quantity: string) => ({
  effectiveAt: new Date(date + 'T12:00:00Z'),
  movementType: type,
  quantity: new Prisma.Decimal(quantity),
});
const period = { from: '2026-09-16', to: '2026-09-30', through: '2026-09-20' };
describe('included part physical coverage', () => {
  it('does not keep a child free after its parent returns', () => {
    expect(
      parentCoversRental(
        lot,
        [move('2026-09-15', 'OUT', '-1'), move('2026-09-17', 'IN', '1')],
        period,
      ),
    ).toBe(false);
  });
  it('accepts the parent and child returning together including return day', () => {
    const returned = {
      ...lot,
      returns: [
        {
          date: '2026-09-17',
          quantity: '1',
          source: { reference: 'return', origin: 'INVENTORY' as const },
        },
      ],
    };
    expect(
      parentCoversRental(
        returned,
        [move('2026-09-15', 'OUT', '-1'), move('2026-09-17', 'IN', '1')],
        period,
      ),
    ).toBe(true);
  });
  it('detects an absent parent from a preceding cut and accepts actual on-site supply', () => {
    expect(
      parentCoversRental(
        lot,
        [move('2026-09-15', 'OUT', '-1'), move('2026-09-15', 'IN', '1')],
        period,
      ),
    ).toBe(false);
    expect(
      parentCoversRental(lot, [move('2026-09-15', 'ON_SITE', '1')], period),
    ).toBe(true);
  });
});
