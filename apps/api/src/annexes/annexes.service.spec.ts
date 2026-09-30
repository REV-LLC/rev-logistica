import { AnnexesService } from './annexes.service';
const input = {
  period: { from: '2026-09-16', to: '2026-09-30', through: '2026-09-25' },
  policy: { version: 'REV-1', includeReturnDay: true, excludedWeekdays: [], excludeHolidays: false, holidays: [], holidayCalendarConfirmed: true, minimumHoursPerMachineDay: '6' },
  rentals: [], machineDays: [],
};
const payload = { customerWorksiteId: 'd30745f6-5bf5-48b5-bd37-74c8db9e654e', expectedRevision: 0, reason: 'Primer corte', input };
function setup() {
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: payload.customerWorksiteId }]),
    annexDraft: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async ({data}) => ({id: 'draft', ...data})), update: jest.fn().mockImplementation(async ({data}) => ({id: 'draft', ...data})) },
    annexDraftRevision: { create: jest.fn().mockImplementation(async ({data}) => data) },
  };
  const prisma = { $transaction: jest.fn(async fn => fn(tx)) };
  return { service: new AnnexesService(prisma as never), tx };
}
describe('annex draft persistence', () => {
  it('calculates server-side and stores data cutoff, input, reason and author', async () => {
    const { service, tx } = setup();
    const result = await service.save(payload, 'author');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.revisions[0]).toMatchObject({ revision: 1, createdBy: 'author', reason: 'Primer corte', input,
      result: { status: 'DRAFT', totals: { rentalNet: '0.00' } } });
    expect(result.revisions[0].through.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });
  it('refuses supplied totals and missing worksites', async () => {
    const { service, tx } = setup();
    await expect(service.save({ ...payload, totals: { net: '1' } }, 'author')).rejects.toThrow();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.save(payload, 'author')).rejects.toThrow('Obra no encontrada');
  });
  it('rejects overlapping periods after locking the worksite', async () => {
    const { service, tx } = setup(); tx.annexDraft.findMany.mockResolvedValue([{ id: 'other', periodFrom: new Date('2026-09-15'), periodTo: new Date('2026-09-30'), revision: 1 }]);
    await expect(service.save(payload, 'author')).rejects.toThrow('solapado');
    expect(tx.annexDraftRevision.create).not.toHaveBeenCalled();
  });
  it('rejects stale edits or repeated creation and preserves existing history', async () => {
    const { service, tx } = setup(); tx.annexDraft.findMany.mockResolvedValue([{ id: 'draft', periodFrom: new Date('2026-09-16'), periodTo: new Date('2026-09-30'), revision: 1 }]);
    await expect(service.save(payload, 'author')).rejects.toThrow('última revisión');
    const saved = await service.save({ ...payload, expectedRevision: 1, input: { ...input, period: { ...input.period, through: '2026-09-26' } } }, 'author');
    expect(saved.revisions[0].revision).toBe(2);
    expect(tx.annexDraft.create).not.toHaveBeenCalled();
    expect(tx.annexDraftRevision.create).toHaveBeenCalledTimes(1);
  });
});
