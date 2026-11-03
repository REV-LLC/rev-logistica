import { AnnexesService } from './annexes.service';
const customerId = '00000000-0000-4000-8000-000000000001',
  siteId = '00000000-0000-4000-8000-000000000002',
  cursor = '00000000-0000-4000-8000-000000000003';
function setup() {
  const prisma = {
    customer: {
      findMany: jest.fn(async () => [
        { id: customerId, name: 'Cliente', _count: { customerWorksites: 2 } },
      ]),
      findUnique: jest.fn(async () => ({
        id: customerId,
        name: 'Cliente',
        customerWorksites: [
          {
            id: siteId,
            alias: 'Obra Norte',
            worksite: { name: 'Norte' },
            _count: { annexDrafts: 3 },
          },
        ],
      })),
    },
    customerWorksite: {
      findUnique: jest.fn(async () => ({
        id: siteId,
        alias: 'Obra Norte',
        customer: { id: customerId, name: 'Cliente' },
        worksite: { name: 'Norte' },
      })),
    },
    annexDraft: {
      findFirst: jest.fn(async () => ({ id: cursor })),
      findMany: jest.fn(async () => [] as any[]),
    },
  };
  return { prisma, service: new AnnexesService(prisma as never) };
}
it('lists every customer and its worksite count without loading annex snapshots', async () => {
  const { service, prisma } = setup();
  expect(await service.library({})).toEqual({
    customers: [{ id: customerId, name: 'Cliente', worksiteCount: 2 }],
  });
  expect(prisma.annexDraft.findMany).not.toHaveBeenCalled();
});
it('lists the selected customer worksites and their saved annex counts', async () => {
  expect(await setup().service.library({ customerId })).toEqual({
    customer: { id: customerId, name: 'Cliente' },
    worksites: [{ id: siteId, name: 'Obra Norte', annexCount: 3 }],
  });
});
it('paginates worksite files using only latest revision metadata and scopes cursors to that worksite', async () => {
  const { prisma, service } = setup();
  const rows = Array.from({ length: 51 }, (_, i) => ({
    id: `file-${i}`,
    revision: 2,
    periodFrom: new Date('2026-11-01'),
    periodTo: new Date('2026-11-15'),
    revisions: [
      {
        invoiceNumber: 'FE-100',
        through: new Date('2026-11-15'),
        createdAt: new Date(),
      },
    ],
  }));
  prisma.annexDraft.findMany.mockResolvedValueOnce(rows);
  const result = await service.library({
    customerId,
    customerWorksiteId: siteId,
    cursor,
  });
  expect(result.annexes).toHaveLength(50);
  expect(result.nextCursor).toBe('file-49');
  expect(prisma.annexDraft.findFirst).toHaveBeenCalledWith({
    where: { id: cursor, customerWorksiteId: siteId },
    select: { id: true },
  });
  const query = prisma.annexDraft.findMany.mock.calls[0][0] as any;
  expect(query.cursor).toEqual({ id: cursor });
  expect(query.take).toBe(51);
  expect(query.select.revisions.select).toEqual({
    revision: true,
    through: true,
    invoiceNumber: true,
    createdAt: true,
  });
  expect(query.select.revisions.select.input).toBeUndefined();
});
it('rejects mismatched customers, unknown worksites and invalid page cursors', async () => {
  const { service, prisma } = setup();
  await expect(
    service.library({ customerId: cursor, customerWorksiteId: siteId }),
  ).rejects.toThrow('no pertenece');
  prisma.customerWorksite.findUnique.mockResolvedValueOnce(null as never);
  await expect(service.library({ customerWorksiteId: siteId })).rejects.toThrow(
    'no pertenece',
  );
  prisma.annexDraft.findFirst.mockResolvedValueOnce(null as never);
  await expect(
    service.library({ customerWorksiteId: siteId, cursor }),
  ).rejects.toThrow('Página');
  await expect(service.library({ cursor })).rejects.toThrow(
    'Selecciona una obra',
  );
  await expect(service.library({ customerId: 'bad' })).rejects.toThrow(
    'no son válidos',
  );
});
