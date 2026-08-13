import { ForbiddenException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';

describe('DocumentsService autosave lifecycle', () => {
  it('creates an in-progress document without generating a PDF', async () => {
    const tx = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'draft-1',
          consecutive: 'RM000001',
          status: DocumentStatus.IN_PROGRESS,
        }),
      },
      documentItem: { createMany: jest.fn() },
      fileObject: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const snapshots = { refresh: jest.fn() };
    const service = new DocumentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      snapshots as never,
    );

    const result = await service.createAutosavedRequestDocument({
      type: DocumentType.REMISSION,
      customerWorksiteId: '3a77fa0f-63cb-4a62-aac4-84905f766930',
      createdBy: 'user-1',
    });

    expect(result).toMatchObject({ id: 'draft-1' });
    expect(tx.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DocumentStatus.IN_PROGRESS }),
      }),
    );
    expect(snapshots.refresh).not.toHaveBeenCalled();
  });

  it('submits the saved form and generates the PDF once', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'draft-1',
          createdBy: 'driver-1',
          status: DocumentStatus.IN_PROGRESS,
          customerWorksiteId: 'worksite-1',
          recipientPhone: '3001234567',
          recipientPhones: ['3001234567'],
          _count: { items: 1 },
          files: [{ id: 'signature-1' }],
        }),
        update: jest.fn().mockResolvedValue({
          id: 'draft-1',
          consecutive: 'RM000001',
          status: DocumentStatus.DRAFT,
        }),
      },
    };
    const snapshots = { refresh: jest.fn().mockResolvedValue({ id: 'pdf-1' }) };
    const service = new DocumentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      snapshots as never,
    );

    await service.submitAutosavedRequestDocument(
      'draft-1',
      { sendWhatsapp: true },
      { sub: 'driver-1', role: Role.DRIVER },
    );

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: DocumentStatus.DRAFT },
      }),
    );
    expect(snapshots.refresh).toHaveBeenCalledTimes(1);
    expect(snapshots.refresh).toHaveBeenCalledWith('draft-1');
  });

  it('prevents a driver from updating another user’s saved form', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'draft-1',
          createdBy: 'driver-2',
          status: DocumentStatus.IN_PROGRESS,
        }),
      },
    };
    const service = new DocumentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateAutosavedRequestDocument(
        'draft-1',
        { type: DocumentType.REMISSION },
        { sub: 'driver-1', role: Role.DRIVER },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
