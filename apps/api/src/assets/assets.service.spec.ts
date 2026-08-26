import { BadRequestException } from '@nestjs/common';
import { AssetsService } from './assets.service';

describe('AssetsService hour meter', () => {
  it('rejects a reading lower than the latest asset hour meter', async () => {
    const tx = {
      assetHourReading: {
        create: jest.fn(),
      },
      asset: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ hourMeter: 125.5 }),
        update: jest.fn(),
      },
    };
    const prisma = {
      asset: { findUnique: jest.fn().mockResolvedValue({ id: 'asset-1' }) },
      warehouse: { findUnique: jest.fn() },
      fileObject: { findFirst: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new AssetsService(prisma as any, { del: jest.fn() } as any);

    await expect(service.updateAsset('asset-1', { hourMeter: 120 }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.assetHourReading.create).not.toHaveBeenCalled();
    expect(tx.asset.update).not.toHaveBeenCalled();
  });
});

describe('AssetsService motor assignment', () => {
  it('assigns an available motor from the same warehouse', async () => {
    const tx = {
      asset: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({
            id: 'mixer-1',
            kind: 'STANDARD',
            motorConfiguration: 'INTERCHANGEABLE',
            warehouseCurrentId: 'warehouse-1',
          })
          .mockResolvedValueOnce({
            id: 'motor-1',
            kind: 'MOTOR',
            active: true,
            warehouseCurrentId: 'warehouse-1',
            assignedToMixer: null,
          }),
        update: jest.fn().mockResolvedValue({
          id: 'mixer-1',
          assignedMotorId: 'motor-1',
          warehouseCurrentId: 'warehouse-1',
          assignedMotor: { id: 'motor-1' },
        }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const cache = { del: jest.fn() };
    const service = new AssetsService(prisma as any, cache as any);

    await expect(service.assignMotor('mixer-1', 'motor-1')).resolves.toMatchObject({
      assignedMotorId: 'motor-1',
    });
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedMotorId: 'motor-1' } }),
    );
    expect(cache.del).toHaveBeenCalledTimes(3);
  });

  it('rejects a motor assigned to another mixer', async () => {
    const tx = {
      asset: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({
            id: 'mixer-1',
            kind: 'STANDARD',
            motorConfiguration: 'INTERCHANGEABLE',
            warehouseCurrentId: 'warehouse-1',
          })
          .mockResolvedValueOnce({
            id: 'motor-1',
            kind: 'MOTOR',
            active: true,
            warehouseCurrentId: 'warehouse-1',
            assignedToMixer: { id: 'mixer-2' },
          }),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new AssetsService(prisma as any, { del: jest.fn() } as any);

    await expect(service.assignMotor('mixer-1', 'motor-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.asset.update).not.toHaveBeenCalled();
  });

  it('rejects assigning a motor to another motor even with corrupted configuration', async () => {
    const tx = {
      asset: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({
            id: 'motor-parent',
            kind: 'MOTOR',
            motorConfiguration: 'INTERCHANGEABLE',
            warehouseCurrentId: 'warehouse-1',
          })
          .mockResolvedValueOnce({
            id: 'motor-child',
            kind: 'MOTOR',
            active: true,
            warehouseCurrentId: 'warehouse-1',
            assignedToMixer: null,
          }),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new AssetsService(prisma as any, { del: jest.fn() } as any);

    await expect(service.assignMotor('motor-parent', 'motor-child'))
      .rejects.toThrow('Un motor no puede tener otro motor asociado');
    expect(tx.asset.update).not.toHaveBeenCalled();
  });
});

describe('AssetsService asset deletion', () => {
  it('archives an asset without deleting its ledger or document history', async () => {
    const deletedAt = new Date('2026-08-24T18:00:00.000Z');
    const tx = {
      asset: {
        update: jest.fn().mockResolvedValue({
          id: 'asset-1',
          active: false,
          deletedAt,
          deletedByUserId: 'user-1',
          deletionReason: 'Registro creado con propietario incorrecto',
        }),
      },
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([]) },
      maintenancePlan: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notificationTopic: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-1',
          active: true,
          deletedAt: null,
          warehouseCurrentId: 'warehouse-1',
          assignedMotorId: null,
          assignedToMixer: null,
        }),
      },
      stockLedger: { deleteMany: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const cache = { del: jest.fn() };
    const service = new AssetsService(prisma as any, cache as any);

    await service.deleteAsset(
      'asset-1',
      'Registro creado con propietario incorrecto',
      'user-1',
    );

    expect(prisma.stockLedger.deleteMany).not.toHaveBeenCalled();
    expect(tx.asset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        active: false,
        deletedByUserId: 'user-1',
        deletionReason: 'Registro creado con propietario incorrecto',
        warehouseCurrentId: null,
      }),
    }));
    expect(cache.del).toHaveBeenCalledTimes(3);
  });

  it('rejects deletion while the asset is on-site or in transit', async () => {
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-1',
          active: true,
          deletedAt: null,
          warehouseCurrentId: null,
          assignedMotorId: null,
          assignedToMixer: null,
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new AssetsService(prisma as any, { del: jest.fn() } as any);

    await expect(service.deleteAsset('asset-1', 'Registro incorrecto', 'user-1'))
      .rejects.toThrow('debe estar devuelto a una bodega');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
