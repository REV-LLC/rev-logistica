import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { json } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UppercaseBodyMiddleware } from '../common/middleware/uppercase-body.middleware';
import { EmployeeLoansController } from './employee-loans.controller';
import { EmployeeLoansService } from './employee-loans.service';

const databaseUrl = process.env.EMPLOYEE_LOANS_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Loan description HTTP + database', () => {
  let db: PrismaService;
  let app: INestApplication;
  let employeeId: string;
  let otherEmployeeId: string;
  let entryId: string;
  const adminId = randomUUID();
  const officeId = randomUUID();
  const suffix = randomUUID();
  const endpoint = () => `/employees/${employeeId}/loans/${entryId}/description`;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.port !== '54414' || url.pathname !== '/loan_description_qa_20261019') {
      throw new Error('Loan tests require the dedicated local QA database.');
    }
    db = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.createMany({ data: [
      { id: adminId, email: `loan-admin-${suffix}@rev.invalid`, passwordHash: 'local-qa-only', role: Role.ADMIN },
      { id: officeId, email: `loan-office-${suffix}@rev.invalid`, passwordHash: 'local-qa-only', role: Role.OFFICE },
    ] });
    const module = await Test.createTestingModule({
      controllers: [EmployeeLoansController],
      providers: [EmployeeLoansService, { provide: PrismaService, useValue: db }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const role = req.headers['x-test-role'] || Role.OFFICE;
        req.user = { sub: role === Role.ADMIN ? adminId : officeId, role };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(json());
    const uppercaseBody = new UppercaseBodyMiddleware();
    app.use(uppercaseBody.use.bind(uppercaseBody));
    await app.init();
  });

  beforeEach(async () => {
    employeeId = randomUUID(); otherEmployeeId = randomUUID(); entryId = randomUUID();
    await db.employee.createMany({ data: [
      { id: employeeId, name: 'HAROLD', lastName: 'PRUEBA HTTP', role: 'OFFICE' },
      { id: otherEmployeeId, name: 'OTRO', lastName: 'PRUEBA HTTP', role: 'OFFICE' },
    ] });
    await db.employeeLoanEntry.create({ data: {
      id: entryId, employeeId, type: 'OPENING', date: new Date('2026-10-19T00:00:00Z'),
      amount: '1300000', detail: 'Saldo inicial', requestId: randomUUID(), createdById: adminId,
    } });
  });

  afterEach(async () => {
    if (!entryId) return;
    await db.employeeLoanDescriptionRevision.deleteMany({ where: { entryId } });
    await db.employeeLoanEntry.deleteMany({ where: { id: entryId } });
    await db.employee.deleteMany({ where: { id: { in: [employeeId, otherEmployeeId] } } });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [adminId, officeId] } } });
      await db.$disconnect();
    }
  });

  it.each([Role.OFFICE, Role.ADMIN])('persists a description-only edit by %s, keeps balances, and exposes it in both readers', async role => {
    const before = await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } });
    const result = await request(app.getHttpServer()).patch(endpoint()).set('x-test-role', role)
      .send({ detail: '  Prestamo iphone 14 pro  ' }).expect(200);
    const after = await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(after).toEqual({ ...before, detail: 'PRESTAMO IPHONE 14 PRO' });
    expect(result.body).toMatchObject({ opening: '1300000.00', balance: '1300000.00', charges: '0.00', payments: '0.00' });
    const revisions = await db.employeeLoanDescriptionRevision.findMany({ where: { entryId } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ beforeDetail: 'Saldo inicial', afterDetail: 'PRESTAMO IPHONE 14 PRO', createdById: role === Role.ADMIN ? adminId : officeId });
    const account = await request(app.getHttpServer()).get(`/employees/${employeeId}/loans`).expect(200);
    expect(account.body.entries[0].detail).toBe('PRESTAMO IPHONE 14 PRO');
    const overview = await request(app.getHttpServer()).get('/employees/loans').expect(200);
    expect(overview.body.find((row: { id: string }) => row.id === employeeId)).toMatchObject({ openingDetail: 'PRESTAMO IPHONE 14 PRO', balance: '1300000.00' });
    await request(app.getHttpServer()).patch(endpoint()).send({ detail: 'Prestamo iphone 14 pro' }).expect(200);
    expect(await db.employeeLoanDescriptionRevision.count({ where: { entryId } })).toBe(1);
    expect(await db.employeeLoanEntry.count({ where: { employeeId } })).toBe(1);
  });

  it.each(['amount', 'date', 'type', 'employeeId', 'requestId', 'createdById', 'sourceReference'])('rejects %s at the HTTP boundary without touching the record', async field => {
    const before = await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } });
    await request(app.getHttpServer()).patch(endpoint()).send({ detail: 'Nuevo detalle', [field]: 'modified' }).expect(400);
    expect(await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } })).toEqual(before);
    expect(await db.employeeLoanDescriptionRevision.count({ where: { entryId } })).toBe(0);
  });

  it.each(['', ' \n\t', 'x'.repeat(501)])('rejects an invalid description over HTTP', async detail => {
    await request(app.getHttpServer()).patch(endpoint()).send({ detail }).expect(400);
    expect((await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } })).detail).toBe('Saldo inicial');
  });

  it('rejects a valid entry ID under a different employee', async () => {
    await request(app.getHttpServer()).patch(`/employees/${otherEmployeeId}/loans/${entryId}/description`)
      .send({ detail: 'No corresponde' }).expect(404);
    expect((await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } })).detail).toBe('Saldo inicial');
  });

  it.each([Role.DRIVER, Role.WAREHOUSE_TABLET, Role.OPERATOR])('keeps %s forbidden', async role => {
    await request(app.getHttpServer()).patch(endpoint()).set('x-test-role', role).send({ detail: 'No permitido' }).expect(403);
    expect(await db.employeeLoanDescriptionRevision.count({ where: { entryId } })).toBe(0);
  });

  it('rolls the description revision back if the record update fails', async () => {
    // The test-only trigger targets only this disposable fixture. It is never
    // part of the migration or installed outside the explicitly guarded QA DB.
    await db.$executeRawUnsafe(`CREATE FUNCTION loan_description_qa_reject_update() RETURNS trigger AS $$ BEGIN IF NEW.id = '${entryId}' THEN RAISE EXCEPTION 'QA simulated update failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe('CREATE TRIGGER loan_description_qa_failure BEFORE UPDATE ON "EmployeeLoanEntry" FOR EACH ROW EXECUTE FUNCTION loan_description_qa_reject_update()');
    try {
      await request(app.getHttpServer()).patch(endpoint()).send({ detail: 'Should roll back' }).expect(500);
      expect(await db.employeeLoanDescriptionRevision.count({ where: { entryId } })).toBe(0);
      expect((await db.employeeLoanEntry.findUniqueOrThrow({ where: { id: entryId } })).detail).toBe('Saldo inicial');
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER loan_description_qa_failure ON "EmployeeLoanEntry"');
      await db.$executeRawUnsafe('DROP FUNCTION loan_description_qa_reject_update()');
    }
  });
});
