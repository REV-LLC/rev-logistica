import { DocumentStatus, DocumentType, Prisma, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';

function createService(consecutives: string[] = []) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    document: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          consecutives.map((consecutive) => ({ consecutive })),
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'doc-1', ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'doc-1', ...data })),
    },
    documentItem: { createMany: jest.fn(), deleteMany: jest.fn() },
    fileObject: { create: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    document: { findUnique: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const service = new DocumentsService(
    prisma as never,
    {} as never,
    {} as never,
    { sendDraftIfNeeded: jest.fn() } as never,
    { refresh: jest.fn() } as never,
  );
  return { service, prisma, tx };
}

describe('Document numbering', () => {
  it.each([
    [DocumentType.REMISSION, 'RM'],
    [DocumentType.RETURN, 'DV'],
  ])(
    'starts the independent APP sequence for %s despite physical history',
    async (type, prefix) => {
      const { service, tx } = createService(['RM019259', 'DV019260']);

      const document = await service.createAutosavedRequestDocument({
        type,
        createdBy: 'user-1',
      });

      expect(document.consecutive).toBe(`${prefix}-APP-000001`);
      expect(tx.document.findMany).toHaveBeenCalledWith({
        where: {
          type,
          OR: [
            { consecutive: { startsWith: `${prefix}-APP-` } },
            { consecutive: { startsWith: `RJ-${prefix}-APP-` } },
          ],
        },
        select: { consecutive: true },
      });
    },
  );

  it('continues after the highest digital number, including rejected documents', async () => {
    const { service } = createService([
      'RM019259',
      'RM-APP-000002',
      'RM-APP-000005',
      'RJ-RM-APP-000008-2',
      'DV-APP-000900',
      'RM-APP-invalid',
    ]);

    const document = await service.createRequestDocument({
      type: DocumentType.REMISSION,
      createdBy: 'user-1',
      sendWhatsapp: false,
      items: [],
    });

    expect(document.consecutive).toBe('RM-APP-000009');
  });

  it('uses the APP series for direct document creation', async () => {
    const { service } = createService();

    const document = await service.createDocument({
      type: DocumentType.RETURN,
      createdBy: 'user-1',
      recipientPhones: ['3001234567'],
    });

    expect(document.consecutive).toBe('DV-APP-000001');
  });

  it.each([
    [DocumentType.REMISSION, '19259', 'RM019259'],
    [DocumentType.RETURN, 'DV019260', 'DV019260'],
  ])(
    'keeps physical numbering for %s separate from generated documents',
    async (type, number, expected) => {
      const { service, tx } = createService(['RM-APP-000003', 'DV-APP-000006']);

      const document = await service.createAutosavedRequestDocument({
        type,
        number,
        createdBy: 'user-1',
      });

      expect(document.consecutive).toBe(expected);
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.document.findMany).not.toHaveBeenCalled();
    },
  );

  it('reserves APP numbers for automatic allocation', async () => {
    const { service, tx } = createService();

    await expect(
      service.createAutosavedRequestDocument({
        type: DocumentType.REMISSION,
        number: 'RM-APP-019259',
        createdBy: 'user-1',
      }),
    ).rejects.toThrow('se asignan automáticamente');
    expect(tx.document.create).not.toHaveBeenCalled();
  });

  it.each(['RM-APP-000001', 'RM019259'])(
    'retains %s when an autosaved form echoes its number',
    async (consecutive) => {
      const { service, prisma, tx } = createService();
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        type: DocumentType.REMISSION,
        status: DocumentStatus.IN_PROGRESS,
        createdBy: 'user-1',
        consecutive,
        recipientPhones: [],
        docDate: new Date('2026-09-08T18:24:00Z'),
      });

      const updated = await service.updateAutosavedRequestDocument(
        'doc-1',
        {
          type: DocumentType.REMISSION,
          number: consecutive,
        },
        { sub: 'user-1', role: Role.DRIVER },
      );

      expect(updated.consecutive).toBe(consecutive);
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    },
  );

  it('retains a generated number when editing a submitted draft', async () => {
    const { service, prisma, tx } = createService();
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      type: DocumentType.RETURN,
      status: DocumentStatus.DRAFT,
      createdBy: 'user-1',
      consecutive: 'DV-APP-000010',
      recipientPhones: [],
      docDate: new Date('2026-09-08T18:24:00Z'),
    });

    await service.updateRequestDocument(
      'doc-1',
      {
        number: 'DV-APP-000010',
        items: [],
      },
      'user-1',
    );

    expect(tx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consecutive: 'DV-APP-000010' }),
      }),
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('allocates the destination series when changing the type of an automatic draft', async () => {
    const { service, prisma } = createService(['DV-APP-000004']);
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      type: DocumentType.REMISSION,
      status: DocumentStatus.IN_PROGRESS,
      createdBy: 'user-1',
      consecutive: 'RM-APP-000010',
      recipientPhones: [],
      docDate: new Date('2026-09-08T18:24:00Z'),
    });

    const updated = await service.updateAutosavedRequestDocument(
      'doc-1',
      {
        type: DocumentType.RETURN,
        number: 'RM-APP-000010',
      },
      { sub: 'user-1', role: Role.DRIVER },
    );

    expect(updated.consecutive).toBe('DV-APP-000005');
  });

  it('reports a duplicate physical number without assigning a different one', async () => {
    const { service, prisma, tx } = createService();
    tx.document.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate consecutive', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['consecutive'] },
      }),
    );

    await expect(
      service.createRequestDocument({
        type: DocumentType.REMISSION,
        number: '19259',
        createdBy: 'user-1',
        sendWhatsapp: false,
        items: [],
      }),
    ).rejects.toThrow('El consecutivo ya existe');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('allocates distinct numbers for concurrent autosaves under transaction locks', async () => {
    const documents: Array<{ id: string; consecutive: string }> = [];
    let queue = Promise.resolve();
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        let release: (() => void) | undefined;
        const tx = {
          $executeRaw: async () => {
            const previous = queue;
            queue = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
          },
          document: {
            findMany: async () => [...documents],
            create: async ({ data }: { data: { consecutive: string } }) => {
              // Allow competing requests to reach their allocation before saving.
              await Promise.resolve();
              if (
                documents.some(
                  (entry) => entry.consecutive === data.consecutive,
                )
              ) {
                throw new Prisma.PrismaClientKnownRequestError('duplicate', {
                  code: 'P2002',
                  clientVersion: 'test',
                  meta: { target: ['consecutive'] },
                });
              }
              const document = { ...data, id: `doc-${documents.length + 1}` };
              documents.push(document);
              return document;
            },
          },
        };
        try {
          return await callback(tx);
        } finally {
          release?.();
        }
      },
    };
    const service = new DocumentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.createAutosavedRequestDocument({
          type: DocumentType.REMISSION,
          createdBy: 'user-1',
        }),
      ),
    );

    expect(new Set(results.map((document) => document.consecutive)).size).toBe(
      12,
    );
    expect(results.map((document) => document.consecutive)).toContain(
      'RM-APP-000012',
    );
  });
});
