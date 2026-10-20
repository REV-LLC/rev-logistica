import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { CacheModule } from '@nestjs/cache-manager';
import { Role } from '@prisma/client';
import request from 'supertest';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { EmployeesService } from '../transport/employees.service';
import { EmployeesController } from '../transport/employees.controller';
import { EmployeeLoansController } from '../transport/employee-loans.controller';
import { EmployeeLoansService } from '../transport/employee-loans.service';
import { EmployeeActivitiesController } from '../employee-activities/employee-activities.controller';
import { EmployeeActivitiesService } from '../employee-activities/employee-activities.service';
import { EmployeePayrollController, PayrollAccessGuard } from '../payroll/employee-payroll.controller';
import { EmployeePayrollService } from '../payroll/employee-payroll.service';
import { EmployeePortalController } from './employee-portal.controller';
import { EmployeePortalModule } from './employee-portal.module';
import { SettingsModule } from '../settings/settings.module';

const employeeId = 'b1773f6a-a59d-44e6-951a-c25b9b782c57';
const otherId = '1331da81-913f-4240-87b8-bc6eee755d18';
const receiptId = '3036094c-c336-43a8-be5d-c4f5dff12c84';
const identity = { id: employeeId, name: 'QA', lastName: 'PERSONAL', active: true, role: 'DRIVER', documentId: 'QA', phone: null, vehicles: [] };
const salary = { effectiveFrom: '2026-10-01', monthlySalary: '1910000', transportAllowance: '250000', note: 'Confirmed', expectedRevision: 1 };
const period = { from: '2026-10-01', to: '2026-10-15', days: 15 };
const receipt = { ...period, expectedSalaryRevision: 1, idempotencyKey: receiptId };

describe('employee portal module composition', () => {
  it('resolves the existing exported services without connecting to a database', async () => {
    const module = await Test.createTestingModule({ imports: [CacheModule.register({ isGlobal: true }), SettingsModule, EmployeePortalModule] })
      .overrideProvider(PrismaService).useValue({}).compile();
    expect(module.get(EmployeePortalController)).toBeInstanceOf(EmployeePortalController);
    expect(module.get(EmployeesService)).toBeInstanceOf(EmployeesService);
    expect(module.get(EmployeeLoansService)).toBeInstanceOf(EmployeeLoansService);
    expect(module.get(EmployeeActivitiesService)).toBeInstanceOf(EmployeeActivitiesService);
    await module.close();
  });
});

describe('personal employee access and payroll write boundary (real JWT + HTTP)', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'employee-portal-isolated-unit-test-only' });
  let users: Record<string, { active: boolean; role: Role; employee: { id: string; active: boolean } | null }>;
  const prisma = {
    user: { findUnique: jest.fn(({ where }) => Promise.resolve(users[where.id] ?? null)) },
    employee: { findUnique: jest.fn().mockResolvedValue({ payrollEnabled: true, user: { role: Role.DRIVER } }) },
  };
  const employees = new EmployeesService(prisma as never);
  const loans = { get: jest.fn(), list: jest.fn(), add: jest.fn(), updateDescription: jest.fn() };
  const activities = { list: jest.fn(), options: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const payroll = { list: jest.fn(), period: jest.fn(), preview: jest.fn(), save: jest.fn(), issue: jest.fn(), receipts: jest.fn(), receiptPdf: jest.fn() };
  const token = (actor: string, role = users[actor].role) => jwt.sign({ sub: actor, role }, { expiresIn: '5m' });
  const auth = (actor: string, role?: Role) => `Bearer ${token(actor, role)}`;
  const oldBypass = process.env.AUTH_BYPASS_LOCAL;
  const oldDeployedBypass = process.env.AUTH_BYPASS_ENABLED;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_LOCAL = 'false'; process.env.AUTH_BYPASS_ENABLED = 'false';
    jest.spyOn(employees, 'getEmployeeProfile').mockResolvedValue(identity as never);
    jest.spyOn(employees, 'getEmployeePhoto').mockImplementation(async () => ({ body: Readable.from(Buffer.from('test-photo')), contentType: 'image/png' }));
    jest.spyOn(employees, 'updateEmployee').mockResolvedValue(identity as never);
    jest.spyOn(employees, 'createEmployee').mockResolvedValue(identity as never);
    const module = await Test.createTestingModule({
      controllers: [EmployeePortalController, EmployeeLoansController, EmployeesController, EmployeeActivitiesController, EmployeePayrollController],
      providers: [JwtAuthGuard, RolesGuard, PayrollAccessGuard,
        { provide: JwtService, useValue: jwt }, { provide: PrismaService, useValue: prisma },
        { provide: EmployeesService, useValue: employees }, { provide: EmployeeLoansService, useValue: loans },
        { provide: EmployeeActivitiesService, useValue: activities }, { provide: EmployeePayrollService, useValue: payroll }],
    }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users = Object.fromEntries(Object.values(Role).map(role => [role, { active: true, role, employee: { id: employeeId, active: true } }]));
    loans.get.mockResolvedValue({ employee: { id: employeeId, name: 'QA', lastName: 'PERSONAL' }, entries: [{ id: 'entry', type: 'OPENING', date: null, detail: 'My loan', amount: '1300000.00', createdById: 'private-actor', sourceRow: 5 }], opening: '1300000', charges: '0', payments: '0', balance: '1300000' });
    activities.list.mockResolvedValue([]);
    payroll.list.mockResolvedValue([]); payroll.period.mockResolvedValue({ employees: [] });
    payroll.preview.mockResolvedValue({ eligible: true }); payroll.save.mockResolvedValue({ revision: 2 }); payroll.issue.mockResolvedValue({ id: receiptId });
    payroll.receiptPdf.mockResolvedValue(Buffer.from('%PDF-test'));
    prisma.employee.findUnique.mockResolvedValue({ payrollEnabled: true, user: { role: Role.DRIVER } });
  });
  afterAll(async () => {
    await app.close();
    if (oldBypass === undefined) delete process.env.AUTH_BYPASS_LOCAL; else process.env.AUTH_BYPASS_LOCAL = oldBypass;
    if (oldDeployedBypass === undefined) delete process.env.AUTH_BYPASS_ENABLED; else process.env.AUTH_BYPASS_ENABLED = oldDeployedBypass;
  });

  it.each([Role.DRIVER, Role.OPERATOR, Role.OFFICE, Role.ADMIN])('%s reads only its linked profile, loans and activities, ignoring a forged ID', async role => {
    const server = app.getHttpServer();
    const profile = await request(server).get(`/employee-portal/profile?employeeId=${otherId}`).set('Authorization', auth(role)).expect(200);
    expect(profile.body).toEqual(identity); expect(profile.headers['cache-control']).toContain('no-store');
    expect(employees.getEmployeeProfile).toHaveBeenCalledWith(employeeId);
    const account = await request(server).get(`/employee-portal/loans?employeeId=${otherId}`).set('Authorization', auth(role)).expect(200);
    expect(loans.get).toHaveBeenCalledWith(employeeId);
    expect(account.body.entries[0]).not.toHaveProperty('createdById'); expect(account.body.entries[0]).not.toHaveProperty('sourceRow');
    await request(server).get(`/employee-portal/activities?month=2026-10&employeeId=${otherId}`).set('Authorization', auth(role)).expect(200);
    expect(activities.list).toHaveBeenCalledWith(employeeId, '2026-10');
    expect(payroll.list).not.toHaveBeenCalled(); expect(payroll.period).not.toHaveBeenCalled();
  });
  it.each(['profile', 'loans', 'activities?month=2026-10'])('requires a valid JWT for %s', async path => {
    await request(app.getHttpServer()).get(`/employee-portal/${path}`).expect(401);
    await request(app.getHttpServer()).get(`/employee-portal/${path}`).set('Authorization', 'Bearer forged.token.value').expect(401);
    expect(loans.get).not.toHaveBeenCalled();
  });
  it('never substitutes another employee when the account is unlinked or inactive', async () => {
    users.DRIVER.employee = null;
    await request(app.getHttpServer()).get('/employee-portal/profile').set('Authorization', auth('DRIVER')).expect(404);
    users.DRIVER.employee = { id: employeeId, active: false };
    await request(app.getHttpServer()).get('/employee-portal/loans').set('Authorization', auth('DRIVER')).expect(404);
    users.DRIVER.active = false;
    await request(app.getHttpServer()).get('/employee-portal/profile').set('Authorization', auth('DRIVER')).expect(403);
    expect(employees.getEmployeeProfile).not.toHaveBeenCalled(); expect(loans.get).not.toHaveBeenCalled();
  });
  it('rejects shared tablets and checks the current database role, not just old claims', async () => {
    await request(app.getHttpServer()).get('/employee-portal/profile').set('Authorization', auth('WAREHOUSE_TABLET')).expect(401);
    users.DRIVER.role = Role.WAREHOUSE_TABLET;
    await request(app.getHttpServer()).get('/employee-portal/profile').set('Authorization', auth('DRIVER', Role.DRIVER)).expect(403);
    expect(employees.getEmployeeProfile).not.toHaveBeenCalled();
  });
  it.each([Role.DRIVER, Role.OPERATOR])('%s cannot use management routes or write a loan or note', async role => {
    const server = app.getHttpServer(); const header = auth(role);
    for (const path of [`/employees/${otherId}`, `/employees/${otherId}/loans`, '/employees/loans', `/employee-activities/${otherId}?month=2026-10`, '/employee-activities/options']) {
      await request(server).get(path).set('Authorization', header).expect(403);
    }
    await request(server).post(`/employees/${employeeId}/loans`).set('Authorization', header).send({}).expect(403);
    await request(server).patch(`/employees/${employeeId}/loans/${receiptId}/description`).set('Authorization', header).send({ detail: 'changed' }).expect(403);
    await request(server).post(`/employee-activities/${employeeId}`).set('Authorization', header).send({}).expect(403);
    expect(loans.add).not.toHaveBeenCalled(); expect(loans.updateDescription).not.toHaveBeenCalled(); expect(activities.create).not.toHaveBeenCalled();
  });
  it('has no personal write, payroll or arbitrary-employee endpoint', async () => {
    for (const path of ['/employee-portal/loans', '/employee-portal/activities', '/employee-portal/profile']) {
      await request(app.getHttpServer()).post(path).set('Authorization', auth('DRIVER')).send({ employeeId: otherId }).expect(404);
    }
    await request(app.getHttpServer()).get(`/employee-portal/profile/${otherId}`).set('Authorization', auth('DRIVER')).expect(404);
    await request(app.getHttpServer()).get('/employee-portal/payroll').set('Authorization', auth('DRIVER')).expect(404);
  });
  it('lets an operator read its own photo but rejects another employee photo', async () => {
    await request(app.getHttpServer()).get(`/employees/${employeeId}/photo`).set('Authorization', auth('OPERATOR')).expect(200);
    await request(app.getHttpServer()).get(`/employees/${otherId}/photo`).set('Authorization', auth('OPERATOR')).expect(403);
    expect(employees.getEmployeePhoto).toHaveBeenCalledTimes(1);
  });
  it.each([Role.OFFICE, Role.DRIVER, Role.OPERATOR])('%s cannot save salaries or issue payroll, even with valid bodies', async role => {
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/salaries`).set('Authorization', auth(role)).send(salary).expect(403);
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/receipts`).set('Authorization', auth(role)).send(receipt).expect(403);
    expect(payroll.save).not.toHaveBeenCalled(); expect(payroll.issue).not.toHaveBeenCalled();
  });
  it('allows an active Admin to save salaries and issue payroll', async () => {
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/salaries`).set('Authorization', auth('ADMIN')).send(salary).expect(201);
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/receipts`).set('Authorization', auth('ADMIN')).send(receipt).expect(201);
    expect(payroll.save).toHaveBeenCalledWith(employeeId, salary, 'ADMIN'); expect(payroll.issue).toHaveBeenCalledWith(employeeId, receipt, 'ADMIN');
  });
  it('revokes old Admin tokens immediately when the database role or active state changes', async () => {
    const header = auth('ADMIN'); users.ADMIN.role = Role.OFFICE;
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/salaries`).set('Authorization', header).send(salary).expect(403);
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/receipts`).set('Authorization', header).send(receipt).expect(403);
    users.ADMIN.role = Role.ADMIN; users.ADMIN.active = false;
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/salaries`).set('Authorization', header).send(salary).expect(403);
    expect(payroll.save).not.toHaveBeenCalled(); expect(payroll.issue).not.toHaveBeenCalled();
  });
  it('keeps Office read access and original PDFs without allowing persistent changes', async () => {
    await request(app.getHttpServer()).get('/employee-payroll').set('Authorization', auth('OFFICE')).expect(200);
    await request(app.getHttpServer()).post(`/employee-payroll/${employeeId}/preview`).set('Authorization', auth('OFFICE')).send(period).expect(201);
    await request(app.getHttpServer()).get(`/employee-payroll/receipts/${receiptId}/pdf`).set('Authorization', auth('OFFICE')).expect(200);
    expect(payroll.receiptPdf).toHaveBeenCalledWith(receiptId); expect(payroll.save).not.toHaveBeenCalled(); expect(payroll.issue).not.toHaveBeenCalled();
  });
  it('closes the employee-form bypass for enrollment and Admin credentials', async () => {
    const server = app.getHttpServer(), header = auth('OFFICE');
    await request(server).patch(`/employees/${employeeId}`).set('Authorization', header).send({ payrollEnabled: false }).expect(403);
    await request(server).patch(`/employees/${employeeId}`).set('Authorization', header).send({ loginRole: 'ADMIN' }).expect(403);
    prisma.employee.findUnique.mockResolvedValue({ payrollEnabled: true, user: { role: Role.ADMIN } });
    await request(server).patch(`/employees/${employeeId}`).set('Authorization', header).send({ loginPassword: 'new-password' }).expect(403);
    expect(employees.updateEmployee).not.toHaveBeenCalled();
    await request(server).patch(`/employees/${employeeId}`).set('Authorization', header).send({ phone: '3000000000', payrollEnabled: true }).expect(200);
    expect(employees.updateEmployee).toHaveBeenCalledWith(employeeId, { phone: '3000000000', payrollEnabled: true });
  });
  it('Office creates operational profiles without writing a provisional salary or enrolling them', async () => {
    const person = { name: 'QA', lastName: 'NEW', role: 'DRIVER' };
    await request(app.getHttpServer()).post('/employees').set('Authorization', auth('OFFICE')).send({ ...person, payrollEnabled: true }).expect(403);
    expect(employees.createEmployee).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/employees').set('Authorization', auth('OFFICE')).send(person).expect(201);
    expect(employees.createEmployee).toHaveBeenCalledWith({ ...person, payrollEnabled: false });
    expect(payroll.save).not.toHaveBeenCalled();
  });
});
