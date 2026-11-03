import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SkuPricingService } from './sku-pricing.service';

const url = process.env.PRICE_AUDIT_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith('/price_audit'))) throw new Error('Price audit tests require an isolated local price_audit database');
const suite = url ? describe : describe.skip;
suite('price audit PostgreSQL transaction', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const service = new SkuPricingService(prisma as never);
  let userId: string;
  let skuId: string;
  let familyId: string;
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `${randomUUID()}@pricing.test`, passwordHash: 'unused', role: 'OFFICE' } })).id;
    familyId = (await prisma.assetFamily.create({ data: { code: randomUUID(), name: randomUUID(), controlType: 'BULK' } })).id;
    skuId = (await prisma.sku.create({ data: { assetFamilyId: familyId, name: 'PRUEBA', price: 100, replacementValue: 200 } })).id;
  });
  afterAll(async () => {
    if (skuId) await prisma.skuPriceChange.deleteMany({ where: { skuId } });
    if (skuId) await prisma.sku.delete({ where: { id: skuId } });
    if (familyId) await prisma.assetFamily.delete({ where: { id: familyId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('keeps one audit row and one winner for simultaneous edits from the same original values', async () => {
    const expected = { price: '100', replacementValue: '200' };
    const results = await Promise.allSettled([
      service.update(skuId, { price: '150', replacementValue: '200', expected, reason: 'Primer editor' }, userId),
      service.update(skuId, { price: '175', replacementValue: '200', expected, reason: 'Segundo editor' }, userId),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const rows = await prisma.skuPriceChange.findMany({ where: { skuId } });
    expect(rows).toHaveLength(1);
    const current = await prisma.sku.findUniqueOrThrow({ where: { id: skuId } });
    expect(current.price!.equals(rows[0].newPrice!)).toBe(true);
    expect(rows[0].oldPrice!.toString()).toBe('100');
    expect(rows[0].changedByUserId).toBe(userId);
  });

  it('rolls back the price update if audit persistence fails', async () => {
    const before = await prisma.sku.findUniqueOrThrow({ where: { id: skuId } });
    const failing = new SkuPricingService({ $transaction: (callback: (tx: unknown) => unknown) => prisma.$transaction(tx => callback({
      ...tx,
      skuPriceChange: { create: async () => { throw new Error('audit unavailable'); } },
    }) as never) } as never);
    await expect(failing.update(skuId, { price: '199', replacementValue: '200', expected: { price: before.price!.toString(), replacementValue: '200' }, reason: 'Prueba de rollback' }, userId)).rejects.toThrow('audit unavailable');
    const after = await prisma.sku.findUniqueOrThrow({ where: { id: skuId } });
    expect(after.price!.equals(before.price!)).toBe(true);
    expect(await prisma.skuPriceChange.count({ where: { skuId } })).toBe(1);
  });
});
