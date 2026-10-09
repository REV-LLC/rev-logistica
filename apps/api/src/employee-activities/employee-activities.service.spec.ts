import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeActivitiesController } from './employee-activities.controller';
import { ActivityNoteDto } from './employee-activities.dto';
import {
  EmployeeActivitiesService,
  parseCalendarDate,
} from './employee-activities.service';

const payload = {
  date: '2026-09-30',
  customerWorksiteId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  description: '  Trabajo en la obra  ',
};

describe('Employee activity notes', () => {
  const prisma = {
    employee: { findUnique: jest.fn() },
    customerWorksite: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn() },
    warehouse: { findUnique: jest.fn() },
    employeeActivityNote: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new EmployeeActivitiesService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.employee.findUnique.mockResolvedValue({ id: 'employee' });
    prisma.warehouse.findUnique.mockResolvedValue({ active: true });
    prisma.customerWorksite.findUnique.mockResolvedValue({
      active: true,
      worksite: { active: true },
    });
    prisma.asset.findUnique.mockResolvedValue({
      active: true,
      deletedAt: null,
    });
  });

  it('stores the calendar day at UTC midnight including leap days', () => {
    expect(parseCalendarDate('2024-02-29').toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
    expect(parseCalendarDate('2026-09-30').toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });
  it.each([
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-9-30',
    '',
    'invalid',
  ])('rejects invalid day %s', (date) => {
    expect(() => parseCalendarDate(date)).toThrow(BadRequestException);
  });
  it('lists only this employee and month with an exclusive next-month boundary', async () => {
    await service.list('employee', '2026-12');
    const { where } = prisma.employeeActivityNote.findMany.mock.calls[0][0];
    expect(where).toEqual({
      employeeId: 'employee',
      date: { lt: new Date('2027-01-01T00:00:00Z') },
      OR: [
        { date: { gte: new Date('2026-12-01T00:00:00Z') } },
        { endDate: { gte: new Date('2026-12-01T00:00:00Z') } },
      ],
    });
  });
  it.each(['2026-00', '2026-13', '2026-9', undefined])(
    'rejects invalid month %s',
    async (month) => {
      await expect(service.list('employee', month as string)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.employeeActivityNote.findMany).not.toHaveBeenCalled();
    },
  );
  it('stores validated associations and the authenticated author', async () => {
    await service.create('employee', payload, 'author');
    expect(prisma.employeeActivityNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          employeeId: 'employee',
          createdByUserId: 'author',
          date: new Date('2026-09-30T00:00:00Z'),
          type: 'WORKSITE',
          warehouseId: null,
          endDate: null,
          assetId: payload.assetId,
          customerWorksiteId: payload.customerWorksiteId,
          description: 'Trabajo en la obra',
        },
      }),
    );
  });
  it.each(['ABSENCE', 'MEDICAL_LEAVE', 'VACATION'] as const)(
    'stores %s without worksite or equipment and strips stale associations',
    async (type) => {
      await service.create(
        'employee',
        { ...payload, type, endDate: '2026-10-05' },
        'author',
      );
      const data = prisma.employeeActivityNote.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        type,
        endDate: new Date('2026-10-05T00:00:00Z'),
        assetId: null,
        customerWorksiteId: null,
      });
      expect(prisma.asset.findUnique).not.toHaveBeenCalled();
      expect(prisma.customerWorksite.findUnique).not.toHaveBeenCalled();
    },
  );
  it.each(['2026-09-29', '2026-02-30', undefined])(
    'rejects invalid report end date %s',
    async (endDate) => {
      await expect(
        service.create(
          'employee',
          {
            date: payload.date,
            type: 'VACATION',
            endDate,
            description: 'Vacaciones',
          },
          'author',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.employeeActivityNote.create).not.toHaveBeenCalled();
    },
  );
  it('accepts a one-day report and validates conditional DTO fields', async () => {
    const report = {
      date: payload.date,
      type: 'ABSENCE' as const,
      endDate: payload.date,
      description: 'Motivo',
    };
    expect(
      await validate(plainToInstance(ActivityNoteDto, report)),
    ).toHaveLength(0);
    const invalid = await validate(
      plainToInstance(ActivityNoteDto, { ...report, endDate: undefined }),
    );
    expect(invalid.map((error) => error.property)).toContain('endDate');
    await service.create('employee', report, 'author');
    expect(
      prisma.employeeActivityNote.create.mock.calls[0][0].data.endDate,
    ).toEqual(new Date('2026-09-30T00:00:00Z'));
  });
  it('clears range fields when replacing a report with a worksite activity', async () => {
    prisma.employeeActivityNote.findFirst.mockResolvedValue({
      assetId: null,
      customerWorksiteId: null,
    });
    await service.update('employee', 'report', payload);
    expect(
      prisma.employeeActivityNote.update.mock.calls[0][0].data,
    ).toMatchObject({
      type: 'WORKSITE',
      endDate: null,
      assetId: payload.assetId,
    });
  });
  const warehousePayload = {
    date: payload.date,
    type: 'WAREHOUSE' as const,
    warehouseId: '33333333-3333-4333-8333-333333333333',
    description: 'Organización de bodega',
  };
  it('stores a warehouse activity without equipment or a date range', async () => {
    expect(
      await validate(plainToInstance(ActivityNoteDto, warehousePayload)),
    ).toHaveLength(0);
    await service.create(
      'employee',
      {
        ...warehousePayload,
        customerWorksiteId: payload.customerWorksiteId,
        endDate: '2026-10-05',
      },
      'author',
    );
    expect(
      prisma.employeeActivityNote.create.mock.calls[0][0].data,
    ).toMatchObject({
      type: 'WAREHOUSE',
      warehouseId: warehousePayload.warehouseId,
      customerWorksiteId: null,
      assetId: null,
      endDate: null,
    });
    expect(prisma.asset.findUnique).not.toHaveBeenCalled();
    expect(prisma.customerWorksite.findUnique).not.toHaveBeenCalled();
  });
  it('requires a valid warehouse and validates optional equipment', async () => {
    for (const fields of [
      { warehouseId: undefined },
      { warehouseId: 'invalid' },
      { assetId: 'invalid' },
    ]) {
      expect(
        (
          await validate(
            plainToInstance(ActivityNoteDto, {
              ...warehousePayload,
              ...fields,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
    await service.create(
      'employee',
      { ...warehousePayload, assetId: payload.assetId },
      'author',
    );
    expect(
      prisma.employeeActivityNote.create.mock.calls[0][0].data.assetId,
    ).toBe(payload.assetId);
    prisma.asset.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        'employee',
        { ...warehousePayload, assetId: payload.assetId },
        'author',
      ),
    ).rejects.toThrow('Selecciona un activo disponible.');
  });
  it('rejects unavailable warehouses but allows editing historical notes', async () => {
    prisma.warehouse.findUnique.mockResolvedValue(null);
    await expect(
      service.create('employee', warehousePayload, 'author'),
    ).rejects.toThrow('Selecciona una bodega disponible.');
    prisma.warehouse.findUnique.mockResolvedValue({ active: false });
    await expect(
      service.create('employee', warehousePayload, 'author'),
    ).rejects.toThrow('Selecciona una bodega disponible.');
    prisma.employeeActivityNote.findFirst.mockResolvedValue({
      warehouseId: warehousePayload.warehouseId,
      customerWorksiteId: null,
      assetId: null,
    });
    await service.update('employee', 'note', warehousePayload);
    expect(prisma.employeeActivityNote.update).toHaveBeenCalled();
  });
  it('clears warehouse when replacing an activity with worksite or absence', async () => {
    prisma.employeeActivityNote.findFirst.mockResolvedValue({
      warehouseId: warehousePayload.warehouseId,
      customerWorksiteId: null,
      assetId: null,
    });
    await service.update('employee', 'note', payload);
    expect(
      prisma.employeeActivityNote.update.mock.calls[0][0].data.warehouseId,
    ).toBeNull();
    await service.update('employee', 'note', {
      ...payload,
      type: 'ABSENCE',
      endDate: payload.date,
    });
    expect(
      prisma.employeeActivityNote.update.mock.calls[1][0].data.warehouseId,
    ).toBeNull();
  });
  it('rejects a missing employee', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);
    await expect(service.create('missing', payload, 'author')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.employeeActivityNote.create).not.toHaveBeenCalled();
  });
  it('rejects an unavailable worksite', async () => {
    prisma.customerWorksite.findUnique.mockResolvedValue({
      active: true,
      worksite: { active: false },
    });
    await expect(service.create('employee', payload, 'author')).rejects.toThrow(
      'Selecciona una obra disponible.',
    );
    expect(prisma.employeeActivityNote.create).not.toHaveBeenCalled();
  });
  it('rejects a deleted asset', async () => {
    prisma.asset.findUnique.mockResolvedValue({
      active: true,
      deletedAt: new Date(),
    });
    await expect(service.create('employee', payload, 'author')).rejects.toThrow(
      'Selecciona un activo disponible.',
    );
    expect(prisma.employeeActivityNote.create).not.toHaveBeenCalled();
  });
  it('allows editing historical notes without replacing inactive associations', async () => {
    prisma.employeeActivityNote.findFirst.mockResolvedValue({
      assetId: payload.assetId,
      customerWorksiteId: payload.customerWorksiteId,
    });
    prisma.asset.findUnique.mockResolvedValue({
      active: false,
      deletedAt: new Date(),
    });
    prisma.customerWorksite.findUnique.mockResolvedValue({
      active: false,
      worksite: { active: false },
    });
    await service.update('employee', 'note', payload);
    expect(prisma.employeeActivityNote.update).toHaveBeenCalled();
  });
  it('prevents editing and deleting another employee’s note', async () => {
    prisma.employeeActivityNote.findFirst.mockResolvedValue(null);
    await expect(
      service.update('employee', 'someone-elses-note', payload),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.remove('employee', 'someone-elses-note'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.employeeActivityNote.findFirst).toHaveBeenCalledWith({
      where: { id: 'someone-elses-note', employeeId: 'employee' },
    });
    expect(prisma.employeeActivityNote.update).not.toHaveBeenCalled();
    expect(prisma.employeeActivityNote.delete).not.toHaveBeenCalled();
  });
  it('rejects whitespace-only descriptions and malformed associations', async () => {
    const errors = await validate(
      plainToInstance(ActivityNoteDto, {
        ...payload,
        description: '   ',
        assetId: 'invalid',
      }),
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      'assetId',
      'description',
    ]);
  });
  it.each(['ADMIN', 'OFFICE', 'DRIVER', 'OPERATOR', 'WAREHOUSE_TABLET'])(
    'enforces access for %s',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      const context = {
        getHandler: () => EmployeeActivitiesController.prototype.create,
        getClass: () => EmployeeActivitiesController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      };
      if (role === 'ADMIN' || role === 'OFFICE')
        expect(guard.canActivate(context as any)).toBe(true);
      else
        expect(() => guard.canActivate(context as any)).toThrow(
          'Insufficient role',
        );
    },
  );
});
