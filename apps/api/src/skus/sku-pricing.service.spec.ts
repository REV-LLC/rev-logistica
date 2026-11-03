import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { SkusController } from './skus.controller';
import { SkuPricingService } from './sku-pricing.service';

const input = { price: '12500.50', replacementValue: '500000', expected: { price: '10000', replacementValue: null }, reason: 'Nueva tarifa de alquiler' };
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    sku: { findUnique: jest.fn().mockResolvedValue({ id: 'sku', price: new Prisma.Decimal(10000), replacementValue: null }), update: jest.fn().mockResolvedValue({ id: 'sku', price: new Prisma.Decimal('12500.50'), replacementValue: new Prisma.Decimal(500000) }) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'actor', email: 'office@example.test', employee: { name: 'ANA', lastName: 'PEREZ' } }) },
    skuPriceChange: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = { ...tx, $transaction: jest.fn().mockImplementation(callback => callback(tx)) };
  return { tx, prisma, service: new SkuPricingService(prisma as never) };
}

it('uses the authenticated server-side actor and writes previous and new values in one transaction', async () => {
  const { tx, prisma, service } = setup();
  await service.update('sku', input, 'actor');
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.skuPriceChange.create).toHaveBeenCalledWith({ data: expect.objectContaining({ skuId: 'sku', oldPrice: new Prisma.Decimal(10000), newPrice: new Prisma.Decimal('12500.50'), oldReplacementValue: null, newReplacementValue: new Prisma.Decimal(500000), changedByUserId: 'actor', changedByName: 'ANA PEREZ', changedByEmail: 'office@example.test', reason: input.reason }) });
  expect(tx.$queryRaw).toHaveBeenCalled();
});

it.each(['-1', '1.234', 'Infinity', 'NaN', '1000000000000', '', '1e3'])('rejects invalid new money %s before persistence', async price => {
  const { service, prisma } = setup();
  await expect(service.update('sku', { ...input, price }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rejects user spoofing and unknown fields', async () => {
  const { service } = setup();
  await expect(service.update('sku', { ...input, changedByUserId: 'someone-else' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
});

it('rejects stale updates instead of overwriting a newer price', async () => {
  const { tx, service } = setup();
  await expect(service.update('sku', { ...input, expected: { ...input.expected, price: '9000' } }, 'actor')).rejects.toBeInstanceOf(ConflictException);
  expect(tx.sku.update).not.toHaveBeenCalled();
  expect(tx.skuPriceChange.create).not.toHaveBeenCalled();
});

it('does not create a history entry for unchanged values', async () => {
  const { tx, service } = setup();
  await expect(service.update('sku', { ...input, price: '10000.00', replacementValue: null }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  expect(tx.sku.update).not.toHaveBeenCalled();
});

it('accepts explicit zero and clearing an optional price', async () => {
  const { tx, service } = setup();
  await service.update('sku', { ...input, price: '0', replacementValue: null }, 'actor');
  expect(tx.sku.update).toHaveBeenCalledWith(expect.objectContaining({ data: { price: '0', replacementValue: null } }));
});

it('does not update missing references', async () => {
  const { tx, service } = setup(); tx.sku.findUnique.mockResolvedValue(null);
  await expect(service.update('sku', input, 'actor')).rejects.toBeInstanceOf(NotFoundException);
});

it('history is bounded and cursors cannot cross references', async () => {
  const { tx, service } = setup();
  tx.skuPriceChange.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ id: String(i) })) as never);
  const page = await service.history('sku');
  expect(page.items).toHaveLength(50); expect(page.nextCursor).toBe('49');
  await expect(service.history('sku', 'foreign-cursor')).rejects.toBeInstanceOf(BadRequestException);
});

it('inherits Admin and Office authorization for pricing and history', () => {
  expect(Reflect.getMetadata(ROLES_KEY, SkusController)).toEqual([Role.ADMIN, Role.OFFICE]);
  for (const method of [SkusController.prototype.updatePricing, SkusController.prototype.priceHistory]) {
    expect(Reflect.getMetadata(ROLES_KEY, method)).toBeUndefined();
  }
});
