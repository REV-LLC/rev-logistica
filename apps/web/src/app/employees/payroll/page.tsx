'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Checkbox, Container, Group, Loader, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconArrowLeft, IconPencil, IconPrinter, IconSearch } from '@tabler/icons-react';
import EmployeeAvatar from '@/components/EmployeeAvatar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import { useClientTableData } from '@/components/tables/useClientTableData';
import type { DataTableColumn } from '@/components/tables/table.types';
import { api } from '@/lib/api';
import { bogotaPayrollMonth, payrollMoney, payrollPeriod } from '@/lib/payroll-period';
import SalaryModal from './SalaryModal';
import ReceiptModal from './ReceiptModal';
import { employeeName, type PayrollEmployee, type PayrollPeriodResponse } from './payroll-types';
import styles from './payroll.module.css';

const numericSort = (value: string | undefined | null) => value == null ? null : Number(value);
const searchValue = (row: PayrollEmployee) => `${employeeName(row)} ${row.documentId ?? ''}`;
const payrollFigures = (row: PayrollEmployee) => row.receipts[0] ?? row.preview;

export default function PayrollPage() {
  const [month, setMonth] = useState(bogotaPayrollMonth);
  const [half, setHalf] = useState<'FIRST' | 'SECOND'>(() => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', day: '2-digit' }).format(new Date())) <= 15 ? 'FIRST' : 'SECOND');
  const [data, setData] = useState<PayrollPeriodResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [salaryEmployee, setSalaryEmployee] = useState<PayrollEmployee | null>(null);
  const [receiptEmployee, setReceiptEmployee] = useState<PayrollEmployee | null>(null);
  // Native month inputs can be empty while editing; never send an invalid period.
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? payrollPeriod(month, half) : null;
  const from = period?.from, to = period?.to;
  useEffect(() => {
    if (!from || !to) { setLoading(false); setData(null); return; }
    const controller = new AbortController(); setLoading(true); setError(null);
    api<PayrollPeriodResponse>(`/employee-payroll/period?from=${from}&to=${to}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) { setData(null); setError(cause instanceof Error ? cause.message : 'No se pudo cargar la nómina.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, attempt]);
  const columns = useMemo<DataTableColumn<PayrollEmployee>[]>(() => [
    { id: 'employee', header: 'Empleado', sortValue: employeeName, minWidth: 210, mobile: { priority: 'primary' }, cell: row => <Group gap="sm" wrap="nowrap"><EmployeeAvatar employee={row} size={32} /><div><Text size="sm" fw={600}>{employeeName(row)}</Text><Text size="xs" c="dimmed">{row.documentId ?? 'Cédula sin registrar'}</Text></div></Group> },
    { id: 'salary', header: 'Base mensual', align: 'right', sortValue: row => numericSort(row.current?.monthlySalary), cell: row => payrollMoney(row.current?.monthlySalary) },
    { id: 'allowance', header: 'Auxilio mensual', align: 'right', sortValue: row => numericSort(row.current?.transportAllowance), cell: row => payrollMoney(row.current?.transportAllowance) },
    { id: 'monthly', header: 'Base + auxilio', align: 'right', sortValue: row => numericSort(row.current?.totalMonthly), cell: row => <Text size="sm" fw={600}>{payrollMoney(row.current?.totalMonthly)}</Text> },
    { id: 'days', header: 'Días', align: 'right', sortValue: row => payrollFigures(row).days, cell: row => payrollFigures(row).days },
    { id: 'earned', header: 'Devengado quincena', align: 'right', sortValue: row => numericSort(payrollFigures(row).totalEarned), cell: row => payrollMoney(payrollFigures(row).totalEarned) },
    { id: 'deductions', header: 'Salud + pensión', align: 'right', sortValue: row => numericSort(payrollFigures(row).totalDeductions), cell: row => payrollMoney(payrollFigures(row).totalDeductions) },
    { id: 'net', header: 'Neto quincena', align: 'right', mobile: { priority: 'primary' }, sortValue: row => numericSort(payrollFigures(row).netPay), cell: row => <Text fw={800} size="sm">{payrollMoney(payrollFigures(row).netPay)}</Text> },
    { id: 'status', header: 'Estado', cell: row => <Stack gap={3} align="flex-start"><Badge color={!row.current || row.current.provisional ? 'yellow' : row.preview.eligible ? 'teal' : 'orange'} variant="light">{!row.current ? 'Sin configurar' : row.current.provisional ? 'Provisional' : row.preview.eligible ? 'Confirmado' : 'Revisión'}</Badge>{row.receipts.length ? <Badge variant="outline" size="xs">Comprobante emitido</Badge> : null}{!row.active ? <Badge color="gray" size="xs">Inactivo</Badge> : null}</Stack> },
  ], []);
  const rows = useMemo(() => (data?.employees ?? []).filter(row => includeInactive || row.active), [data, includeInactive]);
  const table = useClientTableData({ rows, columns, search, searchValue });
  const closeForPeriod = () => { setSalaryEmployee(null); setReceiptEmployee(null); };

  return <Container size="xl" py="xl"><Stack gap="lg">
    <Group justify="space-between" wrap="wrap"><div><Title order={1}>Nómina</Title><Text c="dimmed" size="sm">Salarios, auxilio y comprobantes quincenales del equipo.</Text></div><Button component={Link} href="/employees" variant="subtle" leftSection={<IconArrowLeft size={16} />}>Empleados</Button></Group>
    <Paper withBorder radius="md" p="md"><DataTableToolbar title="Período de liquidación" description="15 días de nómina por quincena completa; puedes ajustar los días al emitir.">
      <TextInput type="month" label="Mes" value={month} onChange={e => { setMonth(e.currentTarget.value); closeForPeriod(); }} style={{ flex: '1 1 150px' }} />
      <Select label="Quincena" value={half} onChange={value => { setHalf(value === 'SECOND' ? 'SECOND' : 'FIRST'); closeForPeriod(); }} allowDeselect={false} data={[{ value: 'FIRST', label: 'Del 1 al 15' }, { value: 'SECOND', label: 'Del 16 a fin de mes' }]} style={{ flex: '1 1 190px' }} />
    </DataTableToolbar>{period ? <Text size="xs" c="dimmed">{period.from} al {period.to}</Text> : <Text c="red" size="sm">Selecciona un mes válido.</Text>}</Paper>
    <Alert color="blue" title="Salario y comprobante son distintos">El total mensual es base + auxilio. Sin comprobante, la tabla estima 15 días; imprimir permite ajustar días y observaciones. Una vez emitido, muestra la liquidación congelada. Los salarios provisionales deben confirmarse. Emitir no registra un pago.</Alert>
    {error ? <Alert color="red" title="No se pudo cargar la nómina"><Stack gap="sm"><Text size="sm">{error}</Text><Button variant="light" onClick={() => setAttempt(value => value + 1)}>Reintentar</Button></Stack></Alert> : null}
    <DataTableToolbar><TextInput aria-label="Buscar empleado en nómina" placeholder="Buscar nombre o cédula" leftSection={<IconSearch size={16} />} value={search} onChange={e => setSearch(e.currentTarget.value)} style={{ flex: '1 1 220px' }} /><Checkbox label="Incluir inactivos" checked={includeInactive} onChange={e => setIncludeInactive(e.currentTarget.checked)} /></DataTableToolbar>
    {loading ? <Loader aria-label="Cargando nómina" /> : period && data ? <div className={styles.table}><EntityDataTable rows={table.rows} columns={columns} getRowId={row => row.id} tableMinWidth={1180} sort={table.sort} onSortChange={table.onSortChange} pagination={table.pagination} onPageSizeChange={table.onPageSizeChange} emptyState={{ title: 'No hay empleados para mostrar', description: 'Revisa la búsqueda o crea un empleado en el directorio.' }} actions={row => [
      { key: 'print', label: `Imprimir nómina de ${employeeName(row)}`, icon: <IconPrinter size={16} />, onClick: () => setReceiptEmployee(row), color: 'blue' },
      { key: 'edit', label: `Modificar salario de ${employeeName(row)}`, icon: <IconPencil size={16} />, onClick: () => setSalaryEmployee(row) },
    ]} /></div> : null}
    {salaryEmployee && data && period ? <SalaryModal key={`${salaryEmployee.id}:${period.from}`} employee={salaryEmployee} date={period.from} policy={data.policy} onClose={() => setSalaryEmployee(null)} onSaved={() => { setSalaryEmployee(null); setAttempt(value => value + 1); }} /> : null}
    {receiptEmployee && period ? <ReceiptModal key={`${receiptEmployee.id}:${period.from}`} employee={receiptEmployee} period={period} onClose={() => setReceiptEmployee(null)} onIssued={() => setAttempt(value => value + 1)} /> : null}
  </Stack></Container>;
}
