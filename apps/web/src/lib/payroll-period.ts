export type PayrollPeriod = { from: string; to: string; defaultDays: number };

export function bogotaPayrollMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}

export function payrollPeriod(month: string, half: 'FIRST' | 'SECOND'): PayrollPeriod {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido');
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-${half === 'FIRST' ? '01' : '16'}`, to: `${month}-${half === 'FIRST' ? '15' : last}`, defaultDays: 15 };
}

// Client formatting only. Financial calculations and rounding live in the API.
const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export function payrollMoney(value: string | null | undefined): string {
  return value == null ? 'Sin configurar' : currency.format(Number(value));
}

export function monthlySalaryTotal(salary: string, allowance: string): string | null {
  // Integer-cent arithmetic for the editable monthly preview, never a payroll calculation.
  const cents = (value: string) => {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const base = cents(salary), transport = cents(allowance);
  if (base === null || transport === null) return null;
  const total = base + transport;
  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
}
