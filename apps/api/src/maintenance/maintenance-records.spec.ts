import 'reflect-metadata';
import { MaintenanceService } from './maintenance.service';
import { RecordMaintenanceDto } from './dto/maintenance.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function setup(chargeType = 'HOUR', currentHours = 100) {
  const tx = {
    maintenancePlan: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'plan' }) },
    maintenanceItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'existing', name: 'Revisión existente' }),
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: data.name })),
    },
    maintenanceCompletion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'completion', ...data })),
    },
    asset: { findUniqueOrThrow: jest.fn().mockResolvedValue({ hourMeter: currentHours }), update: jest.fn() },
    assetHourReading: { create: jest.fn() },
    vehicleHourReading: { findFirst: jest.fn().mockResolvedValue({ hours: currentHours }), create: jest.fn() },
  };
  const prisma = {
    user: { findFirst: jest.fn().mockImplementation(async ({ where }) => ({ id: where.id })) },
    asset: { findUnique: jest.fn().mockResolvedValue({ sku: { chargeType } }) },
    vehicle: { findUnique: jest.fn().mockResolvedValue({ id: 'vehicle' }) },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const notifications = { ensureMaintenanceTopic: jest.fn() };
  const service = new MaintenanceService(prisma as never, notifications as never);
  const payload: RecordMaintenanceDto = { assetId: 'asset', completedAt: '2026-01-01T12:00:00Z', completedAtHours: 150, tasks: [{ name: 'Cambio de aceite' }], notes: 'Aceite y filtros instalados' };
  return { service, tx, prisma, notifications, payload };
}

describe('Direct maintenance records', () => {
  it('records an unplanned service without requiring alerts and advances the meter with an audit reading', async () => {
    const { service, tx, notifications, payload } = setup();
    await service.recordMaintenance(payload, 'admin');
    expect(tx.maintenanceItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ active: false, name: 'Cambio de aceite' }) });
    expect(tx.maintenanceCompletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ completedAtHours: 150, notes: payload.notes, completedByUserId: 'admin' }) });
    expect(tx.assetHourReading.create).toHaveBeenCalledWith({ data: expect.objectContaining({ hours: 150, previousHours: 100, recordedByUserId: 'admin' }) });
    expect(notifications.ensureMaintenanceTopic).not.toHaveBeenCalled();
  });

  it('creates separate recurring cycles from the actual service hours, in the same transaction', async () => {
    const { service, tx, notifications, payload } = setup();
    payload.tasks = [250, 500].map((intervalHours) => ({ name: `Cambio ${intervalHours}`, recurrence: { name: 'Cambio', intervalHours, warningHours: 20, recipients: [{ userId: 'user' }] } }));
    await service.recordMaintenance(payload, 'admin');
    expect(tx.maintenancePlan.create).toHaveBeenCalledTimes(1);
    expect(tx.maintenanceItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ baselineHours: 150, intervalHours: 250, active: true }) });
    expect(tx.maintenanceItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ baselineHours: 150, intervalHours: 500, active: true }) });
    expect(tx.maintenanceCompletion.create).toHaveBeenCalledTimes(2);
    expect(notifications.ensureMaintenanceTopic).toHaveBeenCalledWith('Cambio 250', [{ userId: 'user' }], tx);
  });

  it('preserves a higher current meter when recording earlier work', async () => {
    const { service, tx, payload } = setup('HOUR', 200);
    await service.recordMaintenance(payload, 'admin');
    expect(tx.asset.update).not.toHaveBeenCalled();
    expect(tx.assetHourReading.create).not.toHaveBeenCalled();
  });

  it('reuses an existing revision only within the selected subject and without duplicating plans or alerts', async () => {
    const { service, tx, notifications, payload } = setup();
    payload.tasks = [{ itemId: 'existing' }];
    await service.recordMaintenance(payload, 'admin');
    expect(tx.maintenanceItem.findFirst).toHaveBeenCalledWith({ where: { id: 'existing', active: true, plan: { assetId: 'asset', active: true } } });
    expect(tx.maintenancePlan.create).not.toHaveBeenCalled();
    expect(notifications.ensureMaintenanceTopic).not.toHaveBeenCalled();
  });

  it('rejects a revision belonging to another subject or an archived plan', async () => {
    const { service, tx, payload } = setup();
    tx.maintenanceItem.findFirst.mockResolvedValue(null);
    payload.tasks = [{ itemId: 'foreign' }];
    await expect(service.recordMaintenance(payload, 'admin')).rejects.toThrow('no pertenece');
    expect(tx.maintenanceCompletion.create).not.toHaveBeenCalled();
  });

  it('rejects a date before the latest execution of an existing revision', async () => {
    const { service, tx, payload } = setup();
    tx.maintenanceCompletion.findFirst.mockResolvedValue({ completedAt: new Date('2026-01-02'), completedAtHours: 100 });
    payload.tasks = [{ itemId: 'existing' }];
    await expect(service.recordMaintenance(payload, 'admin')).rejects.toThrow('posterior');
  });

  it('rejects execution hours below the previous execution', async () => {
    const { service, tx, payload } = setup();
    tx.maintenanceCompletion.findFirst.mockResolvedValue({ completedAt: new Date('2025-12-01'), completedAtHours: 200 });
    payload.tasks = [{ itemId: 'existing' }];
    await expect(service.recordMaintenance(payload, 'admin')).rejects.toThrow('inferiores');
  });

  it('requires a meter and rejects future dates and duplicate revisions before opening a transaction', async () => {
    const { service, prisma, payload } = setup();
    await expect(service.recordMaintenance({ ...payload, completedAtHours: undefined }, 'admin')).rejects.toThrow('horómetro');
    await expect(service.recordMaintenance({ ...payload, completedAt: '2999-01-01' }, 'admin')).rejects.toThrow('futuro');
    await expect(service.recordMaintenance({ ...payload, tasks: [{ itemId: 'same' }, { itemId: 'same' }] }, 'admin')).rejects.toThrow('repitas');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records calendar cycles without touching the hour meter', async () => {
    const { service, tx, payload } = setup('DAY');
    payload.completedAtHours = undefined;
    payload.tasks = [{ name: 'Inspección', recurrence: { name: 'Inspección', intervalDays: 30, recipients: [{ userId: 'user' }] } }];
    await service.recordMaintenance(payload, 'admin');
    expect(tx.maintenanceItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ intervalDays: 30, baselineDate: new Date(payload.completedAt!), intervalHours: null }) });
    expect(tx.maintenanceCompletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ completedAtHours: null }) });
    expect(tx.asset.update).not.toHaveBeenCalled();
  });

  it('records vehicle maintenance and advances the vehicle meter', async () => {
    const { service, tx, payload } = setup();
    payload.assetId = undefined;
    payload.vehicleId = 'vehicle';
    await service.recordMaintenance(payload, 'admin');
    expect(tx.vehicleHourReading.create).toHaveBeenCalledWith({ data: expect.objectContaining({ vehicleId: 'vehicle', hours: 150 }) });
  });

  it('propagates notification errors so the enclosing transaction can roll back the record', async () => {
    const { service, notifications, payload, tx } = setup();
    payload.tasks = [{ name: 'Aceite', recurrence: { name: 'Aceite', intervalHours: 250, recipients: [{ userId: 'inactive' }] } }];
    notifications.ensureMaintenanceTopic.mockRejectedValue(new Error('Usuario inactivo'));
    await expect(service.recordMaintenance(payload, 'admin')).rejects.toThrow('Usuario inactivo');
    expect(tx.maintenanceCompletion.create).not.toHaveBeenCalled();
    expect(tx.asset.update).not.toHaveBeenCalled();
  });

  it.each([
    ['Cambio de aceite de motor', '15W-40'],
    ['Cambio de aceite de motor', '0W-20'],
    ['Cambio de aceite hidráulico', 'AW68'],
    ['Cambio de aceite hidráulico', 'ISO68'],
    ['Cambio de filtro de aire', 'AF-123'],
    ['Cambio de filtro de aceite', 'OF-456'],
  ])('preserves the reference for %s in the execution history', async (name, reference) => {
    const { service, tx, payload } = setup();
    payload.tasks = [{ name, reference }];
    await service.recordMaintenance(payload, 'admin');
    expect(tx.maintenanceCompletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reference }) });
  });

  it.each([
    ['Cambio de aceite de motor', '15.5W-40'],
    ['Cambio de aceite hidráulico', 'OTHER'],
    ['Cambio de filtro de aire', ''],
    ['Cambio de filtro de aceite', '  '],
  ])('rejects invalid or missing references for %s', async (name, reference) => {
    const { service, payload, tx } = setup();
    payload.tasks = [{ name, reference }];
    await expect(service.recordMaintenance(payload, 'admin')).rejects.toThrow();
    expect(tx.maintenanceCompletion.create).not.toHaveBeenCalled();
  });

  it('defaults the performer to the session user while retaining the recorder', async () => {
    const { service, tx, payload } = setup();
    await service.recordMaintenance(payload, 'admin');
    expect(tx.maintenanceCompletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ performedByUserId: 'admin', completedByUserId: 'admin' }) });
  });

  it('allows selecting a different active performer without changing the recorder', async () => {
    const { service, tx, prisma, payload } = setup();
    await service.recordMaintenance({ ...payload, performedByUserId: 'mechanic' }, 'admin');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'mechanic', active: true }, select: { id: true } });
    expect(tx.maintenanceCompletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ performedByUserId: 'mechanic', completedByUserId: 'admin' }) });
  });

  it('rejects inactive or missing performers before writing a record', async () => {
    const { service, prisma, payload } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.recordMaintenance({ ...payload, performedByUserId: 'missing' }, 'admin')).rejects.toThrow('usuario activo');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates nested tasks, recipients and numeric intervals at the API boundary', async () => {
    const dto = plainToInstance(RecordMaintenanceDto, { assetId: '73b02e42-f973-4860-add0-d1091d3d238b', tasks: [{ name: 'Aceite', recurrence: { name: 'Aceite', intervalHours: -1, recipients: [] } }] });
    expect((await validate(dto)).some((error) => error.property === 'tasks')).toBe(true);
  });
});
