import { MovementType, Prisma } from '@prisma/client';
import { planWorksiteLoss } from './worksite-loss-plan';
import { getWorksiteQuantityDelta } from './worksite-ledger-balance';
const row = (id: string, type: MovementType, quantity: number, day: number) => ({ id, movementType: type, quantity: new Prisma.Decimal(quantity), effectiveAt: new Date(`2026-09-${day}T12:00:00Z`) });
it('records the five missing units without a warehouse return and preserves delivery origin', () => {
  expect(planWorksiteLoss([row('delivery', 'OUT', -100, 16), row('return', 'IN', 95, 20)], new Date('2026-09-21T12:00:00Z'), new Prisma.Decimal(5)))
    .toEqual([{ deliveryId: 'delivery', quantity: '5' }]);
  expect(getWorksiteQuantityDelta(MovementType.LOSS, 5)).toBe(-5);
});
it('protects later returns and refuses excessive or backdated losses', () => {
  expect(() => planWorksiteLoss([row('delivery', 'OUT', -100, 16), row('return', 'IN', 95, 20)], new Date('2026-09-19T12:00:00Z'), new Prisma.Decimal(6))).toThrow('devolución posterior');
  expect(() => planWorksiteLoss([row('delivery', 'OUT', -5, 20)], new Date('2026-09-19T12:00:00Z'), new Prisma.Decimal(1))).toThrow();
});
it('splits loss allocations FIFO across actual delivery lots', () => {
  expect(planWorksiteLoss([row('one', 'ON_SITE', 3, 16), row('two', 'OUT', -4, 17), row('return', 'IN', 2, 18)], new Date('2026-09-19T12:00:00Z'), new Prisma.Decimal(5)))
    .toEqual([{ deliveryId: 'one', quantity: '1' }, { deliveryId: 'two', quantity: '4' }]);
});
