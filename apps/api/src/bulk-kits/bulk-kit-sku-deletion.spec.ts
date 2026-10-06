import { BadRequestException } from '@nestjs/common';
import { SkusService } from '../skus/skus.service';
import { PrismaService } from '../prisma/prisma.service';
describe('BULK kit SKU protection', () => {
  it('cannot delete a referenced piece, even before the first document movement', async () => {
    const prisma = {
      sku: { findUnique: jest.fn().mockResolvedValue({ id: 'sku' }), delete: jest.fn() },
      asset: { count: jest.fn().mockResolvedValue(0) },
      stockLedger: { count: jest.fn().mockResolvedValue(0) },
      documentItem: { count: jest.fn().mockResolvedValue(0) },
      bulkKitEntry: { count: jest.fn().mockResolvedValue(1) },
    };
    await expect(new SkusService(prisma as unknown as PrismaService).deleteSku('sku')).rejects.toThrow(BadRequestException);
    expect(prisma.sku.delete).not.toHaveBeenCalled();
  });
});
