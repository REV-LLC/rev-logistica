import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, SkuControlType } from '@prisma/client';
import { normalizeBulkKit, saveBulkKitSettings } from './bulk-kits.validation';
describe('BULK kit validation', () => {
  const valid = {
    reference: '  2   m ',
    active: true,
    version: 0,
    entries: [{ skuId: 'sku', quantity: 2 }],
  };
  it('normalizes only the reference; names are not family-specific', () =>
    expect(normalizeBulkKit(valid)).toBe('2 M'));
  it.each([0, -1, 0.5, NaN, Infinity, 1000001])(
    'rejects invalid piece quantity %s',
    (quantity) => {
      expect(() =>
        normalizeBulkKit({ ...valid, entries: [{ skuId: 'sku', quantity }] }),
      ).toThrow(BadRequestException);
    },
  );
  it('rejects blank references, empty kits and repeated pieces', () => {
    expect(() => normalizeBulkKit({ ...valid, reference: ' ' })).toThrow();
    expect(() => normalizeBulkKit({ ...valid, entries: [] })).toThrow();
    expect(() =>
      normalizeBulkKit({
        ...valid,
        entries: [...valid.entries, ...valid.entries],
      }),
    ).toThrow();
  });
  const transaction = (controlType = SkuControlType.BULK, count = 1) => ({
    assetFamily: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'family',
          controlType,
          bulkKitPrefix: 'Previous',
        }),
      updateMany: jest.fn().mockResolvedValue({ count }),
    },
  });
  it('requires a prefix when enabled and never writes stock', async () => {
    const tx = transaction();
    await expect(
      saveBulkKitSettings(tx as unknown as Prisma.TransactionClient, 'family', {
        enabled: true,
        prefix: ' ',
        version: 0,
      }),
    ).rejects.toThrow();
    expect(tx.assetFamily.updateMany).not.toHaveBeenCalled();
    await saveBulkKitSettings(
      tx as unknown as Prisma.TransactionClient,
      'family',
      { enabled: true, prefix: ' Any kit of ', version: 0 },
    );
    expect(tx.assetFamily.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bulkKitPrefix: 'Any kit of',
          bulkKitsEnabled: true,
        }),
      }),
    );
  });
  it('disables a family without deleting its templates/prefix', async () => {
    const tx = transaction();
    await saveBulkKitSettings(
      tx as unknown as Prisma.TransactionClient,
      'family',
      { enabled: false, version: 2 },
    );
    expect(tx.assetFamily.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bulkKitPrefix: 'Previous',
          bulkKitsEnabled: false,
        }),
      }),
    );
  });
  it('rejects serial families and stale settings versions', async () => {
    await expect(
      saveBulkKitSettings(
        transaction(
          SkuControlType.SERIAL,
        ) as unknown as Prisma.TransactionClient,
        'family',
        { enabled: true, prefix: 'A', version: 0 },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      saveBulkKitSettings(
        transaction(
          SkuControlType.BULK,
          0,
        ) as unknown as Prisma.TransactionClient,
        'family',
        { enabled: true, prefix: 'A', version: 0 },
      ),
    ).rejects.toThrow(ConflictException);
  });
});
