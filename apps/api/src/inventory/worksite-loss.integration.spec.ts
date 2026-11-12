import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { InventoryService } from './inventory.service';
import { WorksiteLossService } from './worksite-loss.service';
import { WorksiteLossController } from './worksite-loss.controller';
import { AnnexesService } from '../annexes/annexes.service';
import { inventoryToAnnex } from '../annexes/annex-inventory';

const url = process.env.WORKSITE_LOSS_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith('/worksite_loss_qa'))) throw new Error('Loss tests require an isolated local worksite_loss_qa database');
const suite = url ? describe : describe.skip;
suite('worksite loss: real PostgreSQL inventory, audit, rental cutoff and authorization', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const cache = { get: async () => undefined, set: async () => undefined, del: async () => undefined };
  const inventory = new InventoryService(prisma as never, cache as never);
  const losses = new WorksiteLossService(prisma as never, inventory);
  const annexes = new AnnexesService(prisma as never, losses);
  let userId: string, skuId: string, familyId: string, siteId: string, warehouseId: string, ownerId: string, projectId: string, customerId: string;
  const period = { from: '2026-09-16', to: '2026-09-30', through: '2026-09-25' };
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { email: `${randomUUID()}@loss.test`, passwordHash: 'unused', role: 'OFFICE' } })).id;
    ownerId = (await prisma.owner.create({ data: { name: 'DUEÑO DE PRUEBA' } })).id;
    warehouseId = (await prisma.warehouse.create({ data: { name: 'BODEGA DE PRUEBA', type: 'OWN', ownerCompanyId: ownerId } })).id;
    familyId = (await prisma.assetFamily.create({ data: { code: randomUUID(), name: 'BASES', controlType: 'BULK' } })).id;
    skuId = (await prisma.sku.create({ data: { name: 'BASE COLLAR', assetFamilyId: familyId, price: 10, replacementValue: 100 } })).id;
    customerId = (await prisma.customer.create({ data: { name: 'CLIENTE DE PRUEBA' } })).id;
    projectId = (await prisma.worksite.create({ data: { name: 'OBRA DE PRUEBA' } })).id;
    siteId = (await prisma.customerWorksite.create({ data: { customerId, worksiteId: projectId } })).id;
    await prisma.stockLedger.createMany({ data: [
      { skuId, ownerWarehouseId: warehouseId, warehouseId, movementType: 'ADJUST', quantity: 100, effectiveAt: new Date('2026-09-15T12:00:00Z'), createdBy: userId },
      { skuId, ownerWarehouseId: warehouseId, warehouseId, customerWorksiteId: siteId, movementType: 'OUT', quantity: -100, effectiveAt: new Date('2026-09-16T12:00:00Z'), createdBy: userId },
      { skuId, ownerWarehouseId: warehouseId, warehouseId, customerWorksiteId: siteId, movementType: 'IN', quantity: 95, effectiveAt: new Date('2026-09-20T12:00:00Z'), createdBy: userId },
    ] });
  });
  afterEach(async () => {
    await prisma.annexDraftRevision.deleteMany({ where: { draft: { customerWorksiteId: siteId } } });
    await prisma.annexDraft.deleteMany({ where: { customerWorksiteId: siteId } });
    await prisma.worksiteInventoryLoss.deleteMany({ where: { customerWorksiteId: siteId } });
    await prisma.stockLedger.deleteMany({ where: { ownerWarehouseId: warehouseId } });
    await prisma.asset.deleteMany({ where: { warehouseOwnerId: warehouseId } });
    await prisma.sku.deleteMany({ where: { assetFamilyId: familyId } });
    await prisma.assetFamily.delete({ where: { id: familyId } });
    await prisma.customerWorksite.delete({ where: { id: siteId } });
    await prisma.worksite.delete({ where: { id: projectId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.owner.delete({ where: { id: ownerId } });
    await prisma.user.delete({ where: { id: userId } });
  });
  afterAll(() => prisma.$disconnect());
  const manual = () => ({ requestId: randomUUID(), customerWorksiteId: siteId, skuId, ownerWarehouseId: warehouseId, quantity: '5', date: '2026-09-21', reason: 'Cinco bases perdidas en la obra', responsible: 'RESIDENTE DE OBRA' });
  async function annexPayload() {
    const rows = await prisma.stockLedger.findMany({ where: { customerWorksiteId: siteId }, orderBy: [{ effectiveAt: 'asc' }, { appendOrder: 'asc' }], include: { sku: true, document: true } });
    const source = inventoryToAnnex(rows, period);
    const detail = manual();
    return { customerWorksiteId: siteId, expectedRevision: 0, reason: 'Registrar reposición por pérdida', input: {
      period, policy: { version: 'test', includeReturnDay: true, excludedWeekdays: [], excludeHolidays: false, holidays: [], holidayCalendarConfirmed: true, minimumHoursPerMachineDay: '6' },
      rentals: source.rentals, machineDays: [], additionalCharges: [{ id: randomUUID(), type: 'REPLACEMENT', skuId, description: 'BASE COLLAR', quantity: '5', unitPrice: '100', inventoryLoss: { ownerWarehouseId: warehouseId, date: detail.date, reason: detail.reason, responsible: detail.responsible } }],
    } };
  }
  it('deducts five from the worksite, leaves 95 physically returned, audits actor and retries idempotently', async () => {
    const input = manual();
    const result = await losses.create(input, userId);
    expect(result.createdBy).toBe(userId);
    expect(result.responsible).toBe(input.responsible);
    expect((await inventory.getOnSiteInventory(siteId)).bulk).toHaveLength(0);
    expect((await prisma.stockLedger.aggregate({ where: { warehouseId }, _sum: { quantity: true } }))._sum.quantity!.toString()).toBe('95');
    expect((await losses.create(input, userId)).id).toBe(result.id);
    expect(await prisma.worksiteInventoryLoss.count({ where: { customerWorksiteId: siteId } })).toBe(1);
    await expect(losses.create({ ...input, quantity: '4' }, userId)).rejects.toThrow('otros datos');
  });
  it('serializes concurrent losses so only one can consume the same remaining units', async () => {
    const results = await Promise.allSettled([losses.create({ ...manual(), quantity: '4' }, userId), losses.create({ ...manual(), quantity: '4' }, userId)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await inventory.getOnSiteInventory(siteId)).bulk[0].quantity).toBe(1);
  });
  it('saving a replacement atomically creates one loss and closes billing; another save cannot duplicate it', async () => {
    const payload = await annexPayload();
    const saved = await annexes.save(payload, userId);
    const input = saved.revisions[0].input as unknown as typeof payload.input;
    const result = saved.revisions[0].result as unknown as { lines: Array<{ date: string; kind: string }> };
    expect(result.lines.filter(line => line.kind === 'DAY').some(line => line.date >= '2026-09-21')).toBe(false);
    expect((await inventory.getOnSiteInventory(siteId)).bulk).toHaveLength(0);
    await annexes.save({ ...payload, expectedRevision: 1, input }, userId);
    expect(await prisma.worksiteInventoryLoss.count({ where: { customerWorksiteId: siteId } })).toBe(1);
    await expect(annexes.save({ ...payload, expectedRevision: 2, input: { ...input, additionalCharges: [] } }, userId)).rejects.toThrow('baja registrada');
  });
  it('previews the rental cutoff without deducting stock or writing an audit record', async () => {
    const payload = await annexPayload();
    const result = await annexes.preview(payload.input, siteId, userId);
    expect(result.lines.filter(line => line.kind === 'DAY').some(line => line.date >= '2026-09-21')).toBe(false);
    expect(await prisma.worksiteInventoryLoss.count({ where: { customerWorksiteId: siteId } })).toBe(0);
    expect((await inventory.getOnSiteInventory(siteId)).bulk[0].quantity).toBe(5);
  });
  it('rolls inventory and audit back if saving the annex revision fails', async () => {
    const failing = new AnnexesService({ $transaction: (fn: (tx: unknown) => unknown) => prisma.$transaction(tx => fn({ ...tx,
      annexDraftRevision: { create: async () => { throw new Error('revision unavailable'); } },
    }) as never) } as never, losses);
    await expect(failing.save(await annexPayload(), userId)).rejects.toThrow('revision unavailable');
    expect(await prisma.worksiteInventoryLoss.count({ where: { customerWorksiteId: siteId } })).toBe(0);
    expect(await prisma.stockLedger.count({ where: { customerWorksiteId: siteId, movementType: 'LOSS' } })).toBe(0);
    expect((await inventory.getOnSiteInventory(siteId)).bulk[0].quantity).toBe(5);
  });
  it('links a previously recorded loss to replacement without a second deduction, and blocks double charging', async () => {
    const original = await annexPayload();
    const loss = await losses.create(manual(), userId);
    const payload = { ...original, input: { ...original.input, additionalCharges: original.input.additionalCharges.map(charge => ({ ...charge, inventoryLoss: { ...charge.inventoryLoss, lossId: loss.id } })) } };
    await annexes.save(payload, userId);
    expect(await prisma.stockLedger.count({ where: { customerWorksiteId: siteId, movementType: 'LOSS' } })).toBe(1);
    await expect(annexes.save({ ...payload, expectedRevision: 1, input: { ...payload.input, additionalCharges: [...payload.input.additionalCharges, { ...payload.input.additionalCharges[0], id: randomUUID() }] } }, userId)).rejects.toThrow('otra reposición');
  });
  it('requires signed Admin/Office access and refuses a client-supplied audit actor', async () => {
    const jwt = new JwtService({ secret: 'isolated-test-secret' });
    const module = await Test.createTestingModule({ controllers: [WorksiteLossController], providers: [
      { provide: WorksiteLossService, useValue: losses }, { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt }, JwtAuthGuard, RolesGuard, Reflector,
    ] }).compile();
    const app = module.createNestApplication(); await app.init();
    try {
      const path = '/inventory/worksite-losses';
      await request(app.getHttpServer()).post(path).send(manual()).expect(401);
      await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${jwt.sign({ sub: userId, role: 'DRIVER' })}`).send(manual()).expect(403);
      const auth = `Bearer ${jwt.sign({ sub: userId, role: 'OFFICE' })}`;
      await request(app.getHttpServer()).post(path).set('Authorization', auth).send({ ...manual(), createdBy: randomUUID() }).expect(400);
      const result = await request(app.getHttpServer()).post(path).set('Authorization', auth).send(manual()).expect(201);
      expect(result.body.createdBy).toBe(userId);
    } finally { await app.close(); }
  });
  it('rejects future or invalid dates and losses belonging to another owner', async () => {
    await expect(losses.create({ ...manual(), date: '2040-01-01' }, userId)).rejects.toThrow('futura');
    await expect(losses.create({ ...manual(), date: '2026-02-31' }, userId)).rejects.toThrow('Fecha inválida');
    await expect(losses.create({ ...manual(), ownerWarehouseId: randomUUID() }, userId)).rejects.toThrow('saldo');
    expect(await prisma.worksiteInventoryLoss.count({ where: { customerWorksiteId: siteId } })).toBe(0);
  });
  it('retires an individually serialized lost asset without making it available in a warehouse', async () => {
    await prisma.assetFamily.update({ where: { id: familyId }, data: { controlType: 'SERIAL' } });
    const asset = await prisma.asset.create({ data: { skuId, publicCode: randomUUID(), internalNumber: 1, warehouseOwnerId: warehouseId, serialOrEngine: 'LOSS-TEST' } });
    await prisma.stockLedger.createMany({ data: [
      { assetId: asset.id, ownerWarehouseId: warehouseId, warehouseId, movementType: 'ADJUST', quantity: 1, effectiveAt: new Date('2026-09-15T12:00:00Z'), createdBy: userId },
      { assetId: asset.id, ownerWarehouseId: warehouseId, warehouseId, customerWorksiteId: siteId, movementType: 'OUT', quantity: -1, effectiveAt: new Date('2026-09-16T12:00:00Z'), createdBy: userId },
    ] });
    await losses.create({ ...manual(), assetId: asset.id, quantity: '1' }, userId);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).active).toBe(false);
    expect((await inventory.getOnSiteInventory(siteId)).serial).toHaveLength(0);
    const loss = await prisma.stockLedger.findFirstOrThrow({ where: { assetId: asset.id, movementType: 'LOSS' } });
    expect(loss.warehouseId).toBeNull();
  });
});
