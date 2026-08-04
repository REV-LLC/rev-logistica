import { BadRequestException } from '@nestjs/common';
import { DocumentItemBillingStatus, DocumentType } from '@prisma/client';
import { DocumentsService } from './documents.service';

function createService(returnedDates: Array<Date | null>) {
  const transactionClient = {
    document: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'document-1',
        type: DocumentType.RETURN,
      }),
    },
    documentItem: {
      findMany: jest
        .fn()
        .mockResolvedValue(returnedDates.map((returnedAt) => ({ returnedAt }))),
      updateMany: jest
        .fn()
        .mockResolvedValueOnce({
          count: returnedDates.filter((date) => !date).length,
        })
        .mockResolvedValueOnce({ count: returnedDates.filter(Boolean).length }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };
  const service = new DocumentsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, transactionClient };
}

describe('DocumentsService bulk billing cutoff', () => {
  it('applies one cutoff date to 50 items without replacing individual fields', async () => {
    const { service, transactionClient } = createService(
      Array.from({ length: 50 }, () => null),
    );

    const result = await service.applyDocumentItemsBillingCutoff(
      'document-1',
      '2026-08-04',
      'user-1',
    );

    expect(result.updatedCount).toBe(50);
    expect(transactionClient.documentItem.updateMany).toHaveBeenCalledTimes(2);
    const firstUpdate =
      transactionClient.documentItem.updateMany.mock.calls[0][0];
    expect(firstUpdate.data).toEqual(
      expect.objectContaining({
        billingCutoffDate: new Date('2026-08-04T12:00:00.000Z'),
        billingStatus: DocumentItemBillingStatus.CUT,
        billingUpdatedBy: 'user-1',
      }),
    );
    expect(firstUpdate.data).not.toHaveProperty('returnedAt');
    expect(firstUpdate.data).not.toHaveProperty('billingNote');
  });

  it('rejects the whole update when the cutoff is after an existing return date', async () => {
    const { service, transactionClient } = createService([
      null,
      new Date('2026-08-03T12:00:00.000Z'),
    ]);

    await expect(
      service.applyDocumentItemsBillingCutoff(
        'document-1',
        '2026-08-04',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionClient.documentItem.updateMany).not.toHaveBeenCalled();
  });
});
