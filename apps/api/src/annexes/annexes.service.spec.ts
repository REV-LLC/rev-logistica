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
    worksiteInventoryLoss: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async fn => fn(tx)) };
  const losses = { record: jest.fn(), invalidate: jest.fn().mockResolvedValue(undefined) };
  return { service: new AnnexesService(prisma as never, losses as never), tx, losses };
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

it('rejects non-daily writes before acquiring locks or storing a revision', async () => {
  const { service, tx } = setup();
  await expect(service.save({ ...payload, input: { ...input, machineDays: [{ assetId: 'machine', label: 'machine', date: '2026-09-16', status: 'PENDING', reports: [], pricing: { basePrice: '0' } }] } }, 'author')).rejects.toThrow('solo admite');
  expect(tx.$queryRaw).not.toHaveBeenCalled();
  expect(tx.annexDraftRevision.create).not.toHaveBeenCalled();
});

it.each([0, 19])('persists the selected VAT rate %s in the revision', async (vatPercent) => {
  const { service } = setup();
  const saved = await service.save({ ...payload, input: { ...input, policy: { ...input.policy, vatPercent } } }, 'author');
  expect(saved.revisions[0].input.policy.vatPercent).toBe(vatPercent);
  expect(saved.revisions[0].result.tax.vatPercent).toBe(vatPercent);
});
it('rejects VAT rates outside the supported choices', async () => {
  const { service } = setup();
  await expect(service.save({ ...payload, input: { ...input, policy: { ...input.policy, vatPercent: 5 } } }, 'author')).rejects.toThrow();
});
it('stores observations, both transport rows and their server-calculated VAT in the saved revision', async () => {
  const { service } = setup();
  const observations = 'Entregar copia al residente.\nCoordinar regreso.';
  const transport = {outbound:{quantity:'2',unitPrice:'60000'},return:{quantity:'1',unitPrice:'45000'}};
  const saved = await service.save({...payload,input:{...input,observations,transport,policy:{...input.policy,vatPercent:19}}},'author');
  expect(saved.revisions[0].input).toMatchObject({observations,transport});
  expect(saved.revisions[0].result.summary.subtotal).toBe('165000.00');
  expect(saved.revisions[0].result.tax).toEqual({vatPercent:19,vat:'31350.00',total:'196350.00'});
});

it('persists manual repairs with recalculated totals', async () => {
  const {service} = setup();
  const additionalCharges = [{id:'repair-1',type:'REPAIR',description:'Soldadura',quantity:'2',unitPrice:'12.34'},{id:'repair-2',type:'REPAIR',description:'Pieza',quantity:'1',unitPrice:'0.01'}];
  const saved = await service.save({...payload,input:{...input,additionalCharges,policy:{...input.policy,vatPercent:19}}},'author');
  expect(saved.revisions[0].input.additionalCharges).toEqual(additionalCharges);
  expect(saved.revisions[0].result.tax.total).toBe('29.38');
});

it('rejects new replacements without inventory loss details', async () => {
  const { service, tx, losses } = setup();
  const additionalCharges = [{ id: 'replacement', type: 'REPLACEMENT', description: 'Base perdida', quantity: '5', unitPrice: '100' }];
  await expect(service.save({ ...payload, input: { ...input, additionalCharges } }, 'author')).rejects.toThrow('responsable de la pérdida');
  expect(losses.record).not.toHaveBeenCalled();
  expect(tx.annexDraftRevision.create).not.toHaveBeenCalled();
});

it('preserves unchanged legacy replacements without retroactive inventory deductions', async () => {
  const { service, tx, losses } = setup();
  const additionalCharges = [{ id: 'legacy', type: 'REPLACEMENT', description: 'Reposición anterior', quantity: '5', unitPrice: '100' }];
  tx.annexDraft.findMany.mockResolvedValue([{ id: 'draft', periodFrom: new Date('2026-09-16'), periodTo: new Date('2026-09-30'), revision: 1, revisions: [{ input: { ...input, additionalCharges } }] }]);
  const saved = await service.save({ ...payload, expectedRevision: 1, input: { ...input, additionalCharges } }, 'author');
  expect(saved.revisions[0].input.additionalCharges).toEqual(additionalCharges);
  expect(losses.record).not.toHaveBeenCalled();
  await expect(service.save({ ...payload, expectedRevision: 1, input: { ...input, additionalCharges: [{ ...additionalCharges[0], quantity: '6' }] } }, 'author')).rejects.toThrow('responsable de la pérdida');
});

it('saves detailed transport and a linked repair without dropping their metadata', async () => {
  const {service} = setup();
  const transport = {outbound:{quantity:'0',unitPrice:'0'},return:{quantity:'0',unitPrice:'0'},rows:[
    {id:'trip-1',direction:'outbound',description:'Entrega inicial',quantity:'1',unitPrice:'12.34'},
    {id:'trip-2',direction:'outbound',description:'Segundo viaje',quantity:'1',unitPrice:'0.01'},
    {id:'trip-3',direction:'return',description:'Recogida',quantity:'1',unitPrice:'10'},
  ]};
  const additionalCharges = [{id:'repair',skuId:'eb66aaf3-b010-4f9d-9825-857a2c3d4d43',assetId:'00000000-0000-4000-8000-000000000003',type:'REPAIR',description:'Pieza reparada',quantity:'2',unitPrice:'100'}];
  const saved = await service.save({...payload,input:{...input,transport,additionalCharges,policy:{...input.policy,vatPercent:19}}},'author');
  expect(saved.revisions[0].input).toMatchObject({transport,additionalCharges});
  expect(saved.revisions[0].result.summary.subtotal).toBe('222.35');
  expect(saved.revisions[0].result.tax.total).toBe('264.60');
});

it('stores an uppercase invoice tag on the exact saved revision',async()=>{
 const {service,tx}=setup();
 const saved=await service.save({...payload,invoiceNumber:'  fe-3862 a  '},'author');
 expect(saved.revisions[0].invoiceNumber).toBe('FE-3862 A');
 expect(tx.annexDraftRevision.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({invoiceNumber:'FE-3862 A',createdBy:'author'})}));
});
it('preserves existing invoice metadata for older clients and allows explicit removal in a new revision',async()=>{
 const {service,tx}=setup();
 tx.annexDraft.findMany.mockResolvedValue([{id:'draft',periodFrom:new Date('2026-09-16'),periodTo:new Date('2026-09-30'),revision:1,revisions:[{invoiceNumber:'FE-100'}]}]);
 expect((await service.save({...payload,expectedRevision:1},'author')).revisions[0].invoiceNumber).toBe('FE-100');
 expect((await service.save({...payload,expectedRevision:1,invoiceNumber:null},'author')).revisions[0].invoiceNumber).toBeNull();
});
it.each(['', '   ', 'a'.repeat(81), 'FE\n100'])('rejects invalid invoice tags before creating a revision',async invoiceNumber=>{
 const {service,tx}=setup();await expect(service.save({...payload,invoiceNumber},'author')).rejects.toThrow();expect(tx.annexDraftRevision.create).not.toHaveBeenCalled();
});
