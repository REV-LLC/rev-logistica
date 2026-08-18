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
});
describe('AssetsService asset deletion cleanup', () => {
  function buildAsset(overrides: Record<string, unknown> = {}) {
    return {
      id: 'asset-1',
      skuId: 'sku-1',
      warehouseOwnerId: 'warehouse-owner-1',
      warehouseCurrentId: 'warehouse-current-1',
      sku: { assetSubfamilyId: 'subfamily-1' },
      documentItems: [],
      taskAssets: [],
      ...overrides,
    };
  }

  it('deletes an orphan sku and resets the owner subfamily counter', async () => {
    const asset = buildAsset();
    const tx = {
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([]) },
      notificationTopic: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      stockLedger: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      asset: {
        delete: jest.fn().mockResolvedValue(asset),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
      documentItem: { count: jest.fn().mockResolvedValue(0) },
      providerReceiptItem: { count: jest.fn().mockResolvedValue(0) },
      sku: { delete: jest.fn().mockResolvedValue({ id: 'sku-1' }) },
      assetInternalCounter: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      asset: { findUnique: jest.fn().mockResolvedValue(asset) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new AssetsService(prisma as any, cache as any);

    await service.deleteAsset('asset-1');

    expect(tx.sku.delete).toHaveBeenCalledWith({ where: { id: 'sku-1' } });
    expect(tx.assetInternalCounter.deleteMany).toHaveBeenCalledWith({
      where: {
        ownerWarehouseId: 'warehouse-owner-1',
        assetSubfamilyId: 'subfamily-1',
      },
    });
    expect(cache.del).toHaveBeenCalledTimes(6);
  });

  it('preserves the sku and counter while another unit remains', async () => {
    const asset = buildAsset({ warehouseCurrentId: 'warehouse-owner-1' });
    const tx = {
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([]) },
      notificationTopic: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      stockLedger: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      asset: {
        delete: jest.fn().mockResolvedValue(asset),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
      sku: { delete: jest.fn() },
      assetInternalCounter: { deleteMany: jest.fn() },
    };
    const prisma = {
      asset: { findUnique: jest.fn().mockResolvedValue(asset) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new AssetsService(prisma as any, cache as any);

    await service.deleteAsset('asset-1');

    expect(tx.sku.delete).not.toHaveBeenCalled();
    expect(tx.assetInternalCounter.deleteMany).not.toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledTimes(3);
  });
});
