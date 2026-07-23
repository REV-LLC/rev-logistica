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
    const service = new AssetsService(prisma as any);

    await expect(service.updateAsset('asset-1', { hourMeter: 120 }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.assetHourReading.create).not.toHaveBeenCalled();
    expect(tx.asset.update).not.toHaveBeenCalled();
  });
});
