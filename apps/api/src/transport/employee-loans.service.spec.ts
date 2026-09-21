import { Prisma } from '@prisma/client';
import { EmployeeLoansService, summarizeLoans, type LoanInput } from './employee-loans.service';
const entry = (type: string, amount: string) => ({ type, amount: new Prisma.Decimal(amount) });
const input: LoanInput = { type: 'PAYMENT', amount: '50000', date: '2026-05-15', detail: 'NOMINA', requestId: 'request' };
function setup(opening: unknown = { date: new Date('2026-05-01'), type: 'OPENING' }) {
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee' }]), employeeLoanEntry: {
    findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(opening), create: jest.fn(),
  } };
  const prisma = { $transaction: jest.fn(fn => fn(tx)), employee: { findUnique: jest.fn().mockResolvedValue({ id: 'employee', name: 'MAURICIO', lastName: 'GARCES', loanEntries: [] }) } };
  return { service: new EmployeeLoansService(prisma as never), tx, prisma };
}
describe('Employee loans', () => {
  it('reproduces the paper card with five negative 50000 payments and one positive charge', () => {
    const rows = [entry('OPENING','1025000'), ...['470000','110000','550000','343300','50000'].map(value => entry('CHARGE',value)), ...Array.from({length:5},()=>entry('PAYMENT','50000'))];
    expect(summarizeLoans(rows)).toEqual({ opening: '1025000.00', charges: '1523300.00', payments: '250000.00', balance: '2298300.00' });
  });
  it('keeps decimal precision', () => expect(summarizeLoans([entry('OPENING','0.10'),entry('CHARGE','0.20')]).balance).toBe('0.30'));
  it('returns imported entries with missing dates and includes them in the balance', async () => {
    const { service, prisma } = setup();
    const rows = [
      { ...entry('OPENING', '390000'), date: new Date('2026-03-14'), detail: 'Saldo inicial' },
      { ...entry('CHARGE', '200000'), date: null, detail: 'Sin concepto registrado' },
    ];
    prisma.employee.findUnique.mockResolvedValue({ id: 'employee', name: 'ALEXANDER', lastName: 'GUEVARA', loanEntries: rows } as never);
    const account = await service.get('employee');
    expect(account.balance).toBe('590000.00');
    expect(account.entries[1].date).toBeNull();
    expect(account.entries[1].detail).toBe('Sin concepto registrado');
  });
  it('formats the overview and distinguishes missing opening/payment from zero', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([
      { id: 'one', name: 'MAURICIO', lastName: 'GARCES', documentId: '00123', opening: new Prisma.Decimal('1025000'), balance: new Prisma.Decimal('2298300'), lastPaymentAmount: new Prisma.Decimal('50000'), lastPaymentDate: new Date('2026-07-31') },
      { id: 'two', name: 'NEW', lastName: 'EMPLOYEE', documentId: null, opening: null, balance: new Prisma.Decimal('0'), lastPaymentAmount: null, lastPaymentDate: null },
    ]) };
    const rows = await new EmployeeLoansService(prisma as never).list();
    expect(rows[0]).toMatchObject({ documentId: '00123', opening: '1025000.00', balance: '2298300.00', lastPayment: { amount: '50000.00', date: new Date('2026-07-31') } });
    expect(rows[1]).toMatchObject({ opening: null, balance: '0.00', lastPayment: null });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('records the author and positive payment amount', async () => {
    const { service, tx } = setup(); await service.add('employee',input,'author');
    expect(tx.employeeLoanEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ employeeId:'employee',createdById:'author',type:'PAYMENT',amount:new Prisma.Decimal('50000') }) });
  });
  it('does not duplicate a retried payment', async () => {
    const { service, tx } = setup(); tx.employeeLoanEntry.findUnique.mockResolvedValue({ ...input, amount:new Prisma.Decimal(input.amount),date:new Date('2026-05-15') });
    await service.add('employee',input,'author'); expect(tx.employeeLoanEntry.create).not.toHaveBeenCalled();
  });
  it('rejects reuse of a request with changed data', async () => {
    const { service, tx } = setup(); tx.employeeLoanEntry.findUnique.mockResolvedValue({ ...input,amount:new Prisma.Decimal('1'),date:new Date('2026-05-15') });
    await expect(service.add('employee',input,'author')).rejects.toThrow('otros datos');
  });
  it('requires an opening balance', async () => {
    const { service } = setup(null); await expect(service.add('employee',input,'author')).rejects.toThrow('primero');
  });
  it('rejects a second opening', async () => {
    const { service } = setup(); await expect(service.add('employee',{...input,type:'OPENING'},'author')).rejects.toThrow('ya está');
  });
  it.each(['2026-02-31','2026-04-30'])('rejects invalid or pre-opening date %s', async date => {
    const { service } = setup(); await expect(service.add('employee',{...input,date},'author')).rejects.toThrow();
  });
  it('rejects missing employees', async () => { const {service,tx}=setup();tx.$queryRaw.mockResolvedValue([]);await expect(service.add('missing',input,'author')).rejects.toThrow('no encontrado'); });
});
