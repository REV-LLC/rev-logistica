import 'reflect-metadata';
import { validate } from 'class-validator';
import { RecordAssetHoursDto } from './dto/maintenance.dto';
import { ChargeType, Role, WarehouseType } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  it('requires operator hours before saving an asset report', async () => {
    const prisma = {
      asset: { findUnique: jest.fn().mockResolvedValue({
        id: 'asset-1', sku: { chargeType: ChargeType.HOUR },
        warehouseOwner: { type: WarehouseType.OWN },
      }) },
      $transaction: jest.fn(),
    };
    const service = new MaintenanceService(prisma as never, {} as never);
    await expect(service.recordAssetHours(
      'asset-1', { hours: 241, evidenceFileObjectId: 'file-1' }, 'user-1', Role.OPERATOR,
    )).rejects.toThrow('Debes ingresar las horas reportadas por el operario');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([241, 237])('stores independent operator hours when the meter reads %s', async (hours) => {
    const transactionClient = {
      asset: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ hourMeter: 237 }),
        update: jest.fn().mockResolvedValue({}),
      },
      assetHourReading: {
        create: jest.fn().mockResolvedValue({ id: 'reading-1', hours: 251 }),
      },
    };
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-1',
          sku: { chargeType: ChargeType.HOUR },
          warehouseOwner: { type: WarehouseType.OWN },
        }),
      },
      fileObject: {
        findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(transactionClient)),
    };
    const service = new MaintenanceService(prisma as never, {} as never);

    await service.recordAssetHours(
      'asset-1',
      { hours, operatorReportedHours: 6, evidenceFileObjectId: 'file-1' },
      'user-1',
      Role.OPERATOR,
    );

    expect(transactionClient.assetHourReading.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hours, previousHours: 237, operatorReportedHours: 6 }),
    });
    expect(prisma.fileObject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'file-1',
        entityType: 'ASSET',
        entityId: 'asset-1',
        category: { in: ['EVIDENCIA_HOROMETRO', 'MANTENIMIENTO'] },
        createdBy: 'user-1',
        mimeType: { startsWith: 'image/' },
      },
      select: { id: true },
    });
  });
});

describe('operator reported hours validation', () => {
  it.each([-1, 1.234, NaN, Infinity])('rejects invalid reported hours %s', async (hours) => {
    const payload = Object.assign(new RecordAssetHoursDto(), { hours: 241, operatorReportedHours: hours });
    const errors = await validate(payload);
    expect(errors.some((error) => error.property === 'operatorReportedHours')).toBe(true);
  });

  it.each([0, 6, 6.25])('accepts reported hours %s', async (hours) => {
    const payload = Object.assign(new RecordAssetHoursDto(), { hours: 241, operatorReportedHours: hours });
    expect(await validate(payload)).toEqual([]);
  });
});
