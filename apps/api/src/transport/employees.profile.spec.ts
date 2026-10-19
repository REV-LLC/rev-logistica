import 'reflect-metadata';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmployeeLoansController } from './employee-loans.controller';
import { EmployeeLoansService } from './employee-loans.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

describe('Employee profile identity', () => {
  const id = 'b1773f6a-a59d-44e6-951a-c25b9b782c57';
  const vehicle = { id: 'truck-1', plate: 'ABC123', brand: 'CHEVROLET', model: 'NPR' };
  const identity = { id, name: 'HAROLD', lastName: 'PRUEBA LOCAL', role: 'DRIVER', documentId: '123456789', phone: '3001234567', active: true, vehicles: [vehicle] };
  const storedEmployee = { ...identity, vehicles: [{ vehicle }] };
  const findUnique = jest.fn();
  const service = new EmployeesService({ employee: { findUnique } } as never);
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      // Preserve TransportModule's fixed-loan-routes-before-employee-ID ordering.
      controllers: [EmployeeLoansController, EmployeesController],
      providers: [
        { provide: EmployeesService, useValue: service },
        { provide: EmployeeLoansService, useValue: { list: jest.fn().mockResolvedValue(['loan-list']) } },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = { sub: 'actor', role: context.switchToHttp().getRequest().headers['x-test-role'] || Role.ADMIN };
        return true;
      },
    }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
  });
  beforeEach(() => { jest.clearAllMocks(); findUnique.mockResolvedValue(storedEmployee); });
  afterAll(async () => app.close());

  it('uses a single employee lookup and selects only public profile identity fields', async () => {
    expect(await service.getEmployeeProfile(id)).toEqual(identity);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { id }, select: {
      id: true, name: true, lastName: true, role: true, documentId: true, phone: true, active: true,
      vehicles: { select: { vehicle: { select: { id: true, plate: true, brand: true, model: true } } } },
    } });
  });
  it('preserves every existing vehicle assignment without choosing or creating one', async () => {
    const second = { ...vehicle, id: 'truck-2', plate: 'XYZ789', brand: null, model: null };
    findUnique.mockResolvedValue({ ...storedEmployee, vehicles: [{ vehicle }, { vehicle: second }] });
    expect((await service.getEmployeeProfile(id)).vehicles).toEqual([vehicle, second]);
  });
  it('returns the employee job and an empty list when there is no assigned truck', async () => {
    findUnique.mockResolvedValue({ ...storedEmployee, role: 'MECHANIC', vehicles: [] });
    expect(await service.getEmployeeProfile(id)).toEqual({ ...identity, role: 'MECHANIC', vehicles: [] });
  });
  it('preserves missing document and phone instead of inventing contact information', async () => {
    findUnique.mockResolvedValue({ ...storedEmployee, documentId: null, phone: null });
    expect(await service.getEmployeeProfile(id)).toEqual({ ...identity, documentId: null, phone: null });
  });
  it.each([Role.ADMIN, Role.OFFICE])('lets %s read the exact employee identity', async role => {
    const result = await request(app.getHttpServer()).get(`/employees/${id}`).set('x-test-role', role).expect(200);
    expect(result.body).toEqual(identity);
  });
  it('returns 404 for a missing employee, never a fallback employee', async () => {
    findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(`/employees/${id}`).expect(404);
  });
  it.each(['not-an-id', '123'])('rejects invalid ID %s before querying the database', async invalid => {
    await request(app.getHttpServer()).get(`/employees/${invalid}`).expect(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it.each([Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET])('keeps %s outside the employee profile', async role => {
    await request(app.getHttpServer()).get(`/employees/${id}`).set('x-test-role', role).expect(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('does not capture the existing loan overview as an employee ID', async () => {
    const result = await request(app.getHttpServer()).get('/employees/loans').expect(200);
    expect(result.body).toEqual(['loan-list']);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
