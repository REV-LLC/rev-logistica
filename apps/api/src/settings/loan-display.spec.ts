import 'reflect-metadata';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { json } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UppercaseBodyMiddleware } from '../common/middleware/uppercase-body.middleware';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('Loan display settings HTTP contract', () => {
  let app: INestApplication;
  let stored: { key: string; value: boolean } | null;
  const audit = jest.fn();
  const upsert = jest.fn(async ({ create }) => { stored = create; });
  const prisma = {
    appSetting: {
      findUnique: jest.fn(async () => stored),
      findMany: jest.fn(async () => stored ? [stored] : []),
      upsert,
    },
    appSettingAudit: { create: audit },
    $transaction: jest.fn(async callback => callback(prisma)),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [SettingsService, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = { sub: 'actor', role: context.switchToHttp().getRequest().headers['x-test-role'] || Role.ADMIN };
        return true;
      },
    }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.use(json());
    const uppercase = new UppercaseBodyMiddleware(); app.use(uppercase.use.bind(uppercase));
    await app.init();
  });
  beforeEach(() => { stored = null; jest.clearAllMocks(); });
  afterAll(async () => app.close());

  it.each([Role.ADMIN, Role.OFFICE])('lets %s read the default without writing anything', async role => {
    const result = await request(app.getHttpServer()).get('/settings/loan-display').set('x-test-role', role).expect(200);
    expect(result.body).toEqual({ paymentsPositive: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([true, false])('persists and audits the boolean %s, exposes it to Office', async value => {
    await request(app.getHttpServer()).patch('/settings').send({ values: { 'loans.payments_positive': value } }).expect(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create).toMatchObject({ key: 'loans.payments_positive', value, category: 'LOANS' });
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ settingKey: 'loans.payments_positive', newValue: value, updatedByUserId: 'actor' }) });
    const result = await request(app.getHttpServer()).get('/settings/loan-display').set('x-test-role', Role.OFFICE).expect(200);
    expect(result.body).toEqual({ paymentsPositive: value });
  });
  it.each(['true', 'false', 1, null, {}])('rejects invalid preference %p before writes', async value => {
    await request(app.getHttpServer()).patch('/settings').send({ values: { 'loans.payments_positive': value } }).expect(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([Role.OFFICE, Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET])('does not let %s change the global preference', async role => {
    await request(app.getHttpServer()).patch('/settings').set('x-test-role', role).send({ values: { 'loans.payments_positive': true } }).expect(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET])('does not expose loan settings to %s', async role => {
    await request(app.getHttpServer()).get('/settings/loan-display').set('x-test-role', role).expect(403);
  });
});
