import { ChargeType, Role, WarehouseType } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  it('accepts the category used by hour-meter evidence uploads', async () => {
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
      { hours: 251, evidenceFileObjectId: 'file-1' },
      'user-1',
      Role.OPERATOR,
    );

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
