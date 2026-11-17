import {
  billingCuts,
  classifyBillingCut,
  type SavedCut,
} from './annex-billing-overview';
import { AnnexBillingOverviewService } from './annex-billing-overview.service';
const cuts = billingCuts('2026-11-07'),
  oct = cuts[2];
const doc = (
  from: string,
  to: string,
  through: string,
  invoiceNumber: string | null,
  extra: Partial<SavedCut> = {},
): SavedCut => ({
  id: 'saved',
  from,
  to,
  through,
  invoiceNumber,
  billedDays: [],
  manual: false,
  ...extra,
});
describe('billing overview', () => {
  it('includes the current half month only through today, including leap days and year boundaries', () => {
    expect(cuts.map((c) => [c.from, c.to, c.through])).toEqual([
      ['2026-09-16', '2026-09-30', '2026-09-30'],
      ['2026-10-01', '2026-10-15', '2026-10-15'],
      ['2026-10-16', '2026-10-31', '2026-10-31'],
      ['2026-11-01', '2026-11-15', '2026-11-07'],
    ]);
    expect(billingCuts('2024-03-01')[2].to).toBe('2024-02-29');
    expect(billingCuts('2026-01-16')[0].from).toBe('2025-12-01');
  });
  it('excludes an empty saved annex and surfaces an active unsaved cut', () => {
    expect(
      classifyBillingCut(oct, new Set(), [doc(oct.from, oct.to, oct.to, null)]),
    ).toEqual([]);
    expect(classifyBillingCut(oct, new Set(['2026-10-18']), [])).toEqual([
      { ...oct, draftId: null, invoiceNumber: null },
    ]);
  });
  it('accepts manual charges even without inventory and historical invoiced activity', () => {
    expect(
      classifyBillingCut(oct, new Set(), [
        doc(oct.from, oct.to, oct.to, null, { manual: true }),
      ])[0].draftId,
    ).toBe('saved');
    expect(
      classifyBillingCut(oct, new Set(), [
        doc(oct.from, oct.to, oct.to, 'NC-004', { billedDays: ['2026-10-18'] }),
      ])[0].invoiceNumber,
    ).toBe('NC-004');
  });
  it('a monthly invoice covers both halves, while a partial invoice leaves only uncovered days pending', () => {
    const month = doc('2026-10-01', '2026-10-31', '2026-10-31', 'FV-002');
    for (const cut of cuts.slice(1, 3))
      expect(classifyBillingCut(cut, new Set([cut.from]), [month])).toEqual([
        { ...cut, draftId: 'saved', invoiceNumber: 'FV-002' },
      ]);
    const partial = doc('2026-10-16', '2026-10-31', '2026-10-20', 'FE-003');
    expect(
      classifyBillingCut(oct, new Set(['2026-10-16', '2026-10-27']), [partial]),
    ).toEqual([
      {
        from: '2026-10-16',
        to: '2026-10-20',
        through: '2026-10-20',
        draftId: 'saved',
        invoiceNumber: 'FE-003',
      },
      {
        from: '2026-10-21',
        to: '2026-10-31',
        through: '2026-10-31',
        draftId: null,
        invoiceNumber: null,
      },
    ]);
  });
  it('does not open a saved, overlapping unbilled period when part of it was invoiced', () => {
    const pending = doc(oct.from, oct.to, oct.to, null, { id: 'overlaps' });
    const invoice = doc('2026-10-20', '2026-10-25', '2026-10-25', 'FE-1');
    const result = classifyBillingCut(
      oct,
      new Set(['2026-10-16', '2026-10-23', '2026-10-31']),
      [pending, invoice],
    );
    expect(
      result
        .filter((r) => !r.invoiceNumber)
        .map((r) => [r.from, r.to, r.draftId]),
    ).toEqual([
      ['2026-10-16', '2026-10-19', null],
      ['2026-10-26', '2026-10-31', null],
    ]);
  });
});

it('identifies a monthly saved annex in both halves and reserves the exact open range for an unsaved cut', async () => {
  const siteId = 'site';
  const saved = {
    ...doc('2026-10-01', '2026-10-31', '2026-10-31', 'FE-20'),
    siteId, annexCode: '024103',
  };
  const query = jest.fn().mockResolvedValueOnce([saved]).mockResolvedValueOnce([
    { siteId, from: '2026-11-01', through: '2026-11-07', annexCode: '024114' },
  ]);
  const db = {
    customerWorksite: {findMany: jest.fn().mockResolvedValue([
      {id: siteId, alias: null, customer: {id: 'customer', name: 'Cliente'}, worksite: {name: 'Obra'}},
    ])},
    $queryRaw: query,
  };
  const service = new AnnexBillingOverviewService(db as never, {} as never);
  jest.spyOn(service as any, 'activity').mockResolvedValue(new Map([
    [siteId + '/2026-10-01', {days: ['2026-10-01'], review: false}],
    [siteId + '/2026-10-16', {days: ['2026-10-16'], review: false}],
    [siteId + '/2026-11-01', {days: ['2026-11-01'], review: false}],
  ]));
  const report = await service.overview(new Date('2026-11-07T12:00:00Z'));
  expect(report.rows.map(row => [row.from, row.annexCode, row.draftId])).toEqual([
    ['2026-10-01', '024103', 'saved'],
    ['2026-10-16', '024103', 'saved'],
    ['2026-11-01', '024114', null],
  ]);
  const reservation = query.mock.calls[1];
  expect(reservation[1].values).toEqual([siteId, '2026-11-01', '2026-11-07']);
});
