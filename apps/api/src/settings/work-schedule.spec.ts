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
import {
  DEFAULT_WORK_SCHEDULE,
  validateWorkSchedule,
  WORK_SCHEDULE_KEY,
} from './work-schedule';

const schedule = () => structuredClone(DEFAULT_WORK_SCHEDULE);
describe('REV work schedule validation', () => {
  it('matches the requested seven-day schedule and 42 working hours, excluding lunch', () => {
    const value = schedule();
    expect(() => validateWorkSchedule(value)).not.toThrow();
    expect(value.days[0].periods).toEqual([
      { start: '07:00', end: '12:00' },
      { start: '13:00', end: '16:00' },
    ]);
    for (const day of value.days.slice(1, 5))
      expect(day.periods[0].start).toBe('07:30');
    expect(value.days[5].periods).toEqual([{ start: '07:00', end: '11:00' }]);
    expect(value.days[6].periods).toEqual([]);
    const minutes = (time: string) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    expect(
      value.days
        .flatMap((day) => day.periods)
        .reduce((sum, p) => sum + minutes(p.end) - minutes(p.start), 0),
    ).toBe(42 * 60);
  });
  it.each([
    null,
    [],
    {},
    { days: [] },
    { ...DEFAULT_WORK_SCHEDULE, timeZone: 'UTC' },
  ])('rejects malformed root %p', (value) => {
    expect(() => validateWorkSchedule(value)).toThrow();
  });
  it.each([
    { start: '7:00', end: '12:00' },
    { start: '24:00', end: '25:00' },
    { start: '07:60', end: '12:00' },
    { start: '12:00', end: '07:00' },
    { start: '07:00', end: '07:00' },
    { start: '', end: '12:00' },
  ])('rejects invalid period %p', (period) => {
    const value = schedule();
    value.days[0].periods = [period];
    expect(() => validateWorkSchedule(value)).toThrow();
  });
  it('rejects duplicate or out-of-range days and overlapping periods', () => {
    const duplicate = schedule();
    duplicate.days[1].dayOfWeek = 1;
    expect(() => validateWorkSchedule(duplicate)).toThrow();
    const invalid = schedule();
    invalid.days[0].dayOfWeek = 0;
    expect(() => validateWorkSchedule(invalid)).toThrow();
    const overlap = schedule();
    overlap.days[0].periods[1].start = '11:30';
    expect(() => validateWorkSchedule(overlap)).toThrow();
    const tooMany = schedule();
    tooMany.days[0].periods.push({ start: '18:00', end: '19:00' });
    expect(() => validateWorkSchedule(tooMany)).toThrow();
  });
  it('supports non-working days and a configurable Sunday', () => {
    const value = schedule();
    value.days[0].periods = [];
    value.days[6].periods = [{ start: '09:00', end: '12:00' }];
    expect(() => validateWorkSchedule(value)).not.toThrow();
  });
});

describe('REV work schedule HTTP persistence and permissions', () => {
  let app: INestApplication;
  let stored: any = null;
  const audit = jest.fn();
  const prisma = {
    appSetting: {
      findUnique: jest.fn(async () => stored),
      findMany: jest.fn(async () => (stored ? [stored] : [])),
      upsert: jest.fn(async ({ create, update }) => {
          stored = {
            ...(stored ?? {}),
            ...(stored ? update : create),
          updatedAt: '2026-11-20T12:00:00Z',
        };
      }),
    },
    appSettingAudit: { create: audit },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          req.user = {
            sub: 'real-actor',
            role: req.headers['x-test-role'] || Role.ADMIN,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(json());
    const uppercase = new UppercaseBodyMiddleware();
    app.use(uppercase.use.bind(uppercase));
    await app.init();
  });
  beforeEach(() => {
    stored = null;
    jest.clearAllMocks();
  });
  afterAll(async () => app.close());
  it.each([Role.ADMIN, Role.OFFICE])(
    'lets %s read and configure only the schedule with an audit actor from authentication',
    async (role) => {
      const initial = await request(app.getHttpServer())
        .get('/settings/work-schedule')
        .set('x-test-role', role)
        .expect(200);
      expect(initial.body).toEqual({
        schedule: DEFAULT_WORK_SCHEDULE,
        timeZone: 'America/Bogota',
        updatedAt: null,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const next = schedule();
      next.days[5].periods[0].end = '12:00';
      const result = await request(app.getHttpServer())
        .patch('/settings/work-schedule')
        .set('x-test-role', role)
        .send({ schedule: next })
        .expect(200);
      expect(result.body.schedule).toEqual(next);
      expect(audit).toHaveBeenCalledWith({
        data: expect.objectContaining({
          settingKey: WORK_SCHEDULE_KEY,
          newValue: next,
          updatedByUserId: 'real-actor',
        }),
      });
      const reloaded = await request(app.getHttpServer())
        .get('/settings/work-schedule')
        .set('x-test-role', role)
        .expect(200);
      expect(reloaded.body.schedule).toEqual(next);
    },
  );
  it.each([Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET, Role.EMPLOYEE])(
    'denies schedule access and edits to %s',
    async (role) => {
      await request(app.getHttpServer())
        .get('/settings/work-schedule')
        .set('x-test-role', role)
        .expect(403);
      await request(app.getHttpServer())
        .patch('/settings/work-schedule')
        .set('x-test-role', role)
        .send({ schedule: schedule() })
        .expect(403);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects actor spoofing and invalid schedules before any write', async () => {
    await request(app.getHttpServer())
      .patch('/settings/work-schedule')
      .send({ schedule: schedule(), updatedByUserId: 'fake' })
      .expect(400);
    const invalid = schedule();
    invalid.days[0].periods[1].start = '11:00';
    await request(app.getHttpServer())
      .patch('/settings/work-schedule')
      .send({ schedule: invalid })
      .expect(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('enforces the same validation through the generic admin settings route', async () => {
    await request(app.getHttpServer())
      .patch('/settings')
      .send({ values: { [WORK_SCHEDULE_KEY]: { days: [] } } })
      .expect(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('retains the previous schedule and the responsible user in audit history', async () => {
    const before = schedule();
    stored = { key: WORK_SCHEDULE_KEY, value: before };
    const next = schedule();
    next.days[0].periods[0].start = '06:30';
    await request(app.getHttpServer())
      .patch('/settings/work-schedule')
      .send({ schedule: next })
      .expect(200);
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValue: before,
        newValue: next,
        updatedByUserId: 'real-actor',
      }),
    });
  });
});
