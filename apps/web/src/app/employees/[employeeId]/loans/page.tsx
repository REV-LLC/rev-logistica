'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Button, Container, Group, Loader, Modal, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { api } from '@/lib/api';
import FormGrid from '@/components/FormGrid';

type Entry = { id: string; type: 'OPENING' | 'CHARGE' | 'PAYMENT'; date: string | null; detail: string; amount: string };
type Account = { employee: { id: string; name: string; lastName: string }; entries: Entry[]; opening: string; charges: string; payments: string; balance: string };
const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value));
const dateLabel = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('/') : 'Sin fecha registrada';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function EmployeeLoanPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <EmployeeLoanCard key={employeeId} employeeId={employeeId} />;
}
function EmployeeLoanCard({ employeeId }: { employeeId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [type, setType] = useState<Entry['type']>('CHARGE');
  const [date, setDate] = useState(today);
  const [detail, setDetail] = useState('');
  const [amount, setAmount] = useState<string | number>('');
  const request = useRef<{ id: string; payload: string } | null>(null);
  const submitting = useRef(false);
  async function load(signal?: AbortSignal) {
    setLoading(true); setError(null);
    try { const result = await api<Account>(`/employees/${employeeId}/loans`, { signal }); if (!signal?.aborted) setAccount(result); }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la tarjeta.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [employeeId]);
  const opening = account?.entries.find(entry => entry.type === 'OPENING');
  const entries = account?.entries.filter(entry => entry.type !== 'OPENING') ?? [];
  function openForm() {
    setType(opening ? 'CHARGE' : 'OPENING'); setDate(today()); setDetail(opening ? '' : 'Saldo inicial'); setAmount(''); setSaveError(null); request.current = null; setOpen(true);
  }
  async function save() {
    if (submitting.current) return;
    if (!date || !detail.trim() || amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0 || (type !== 'OPENING' && Number(amount) === 0)) {
      setSaveError('Completa la fecha, el detalle y un valor válido.'); return;
    }
    const body = { type, date, detail: detail.trim(), amount: String(amount) };
    const payload = JSON.stringify(body);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    submitting.current = true; setSaving(true); setSaveError(null);
    try {
      const updated = await api<Account>(`/employees/${employeeId}/loans`, { method: 'POST', json: { ...body, requestId: request.current!.id } });
      setAccount(updated); setOpen(false); request.current = null;
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'No se pudo guardar. Intenta de nuevo.'); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <Container size="md" py="xl"><Stack gap="lg">
    <Group justify="space-between"><Button component={Link} href="/employees" variant="subtle" leftSection={<IconArrowLeft size={16} />}>Empleados</Button>
      <Button onClick={openForm} disabled={!account || loading} leftSection={<IconPlus size={16} />}>{opening ? 'Agregar movimiento' : 'Registrar saldo inicial'}</Button></Group>
    <div><Title order={1}>Préstamos y deudas</Title><Text c="dimmed">{account ? `${account.employee.name} ${account.employee.lastName}` : 'Tarjeta del empleado'}</Text></div>
    {loading ? <Loader aria-label="Cargando tarjeta" /> : null}
    {error ? <Alert color="red">{error}<Button variant="subtle" onClick={() => void load()}>Reintentar</Button></Alert> : null}
    {account ? <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group justify="space-between" p="md" bg="blue.0"><Text fw={700}>Nombre del empleado</Text><Text fw={700}>{account.employee.name} {account.employee.lastName}</Text></Group>
      <Group justify="space-between" p="md" bg="yellow.1"><div><Text fw={700}>Valor inicial</Text><Text size="sm">{opening ? dateLabel(opening.date) : 'Sin registrar'}</Text></div><Text fw={700} size="lg">{opening ? money(account.opening) : '—'}</Text></Group>
      <Text ta="center" fw={700} py="sm" bg="blue.1">Fechas de abonos / pagos y cargos</Text>
      <div role="region" aria-label="Movimientos del préstamo" tabIndex={0}
        style={{ maxHeight: 'min(420px, 50dvh)', overflow: 'auto', overscrollBehavior: 'contain' }}>
      <Table stickyHeader stickyHeaderOffset={0} horizontalSpacing={6} className="table-mobile-fit" style={{ tableLayout: 'fixed' }} striped withRowBorders>
        <Table.Thead><Table.Tr><Table.Th w="30%">Fecha</Table.Th><Table.Th w="34%">Detalle</Table.Th><Table.Th w="36%" ta="right">Valor</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{entries.map(entry => <Table.Tr key={entry.id}>
          <Table.Td style={{ fontSize: 12 }}>{dateLabel(entry.date)}</Table.Td>
          <Table.Td style={{ overflowWrap: 'anywhere' }}><Text size="sm" fw={500}>{entry.detail}</Text><Text size="xs" c="dimmed">{entry.type === 'PAYMENT' ? 'Abono / descuento' : 'Cargo'}</Text></Table.Td>
          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }} c={entry.type === 'PAYMENT' ? 'teal.8' : undefined}>{entry.type === 'PAYMENT' ? '−' : '+'}{money(entry.amount)}</Table.Td>
        </Table.Tr>)}
        {!entries.length ? <Table.Tr><Table.Td colSpan={3}><Text c="dimmed" ta="center" py="xl">{opening ? 'Aún no hay movimientos.' : 'Registra el valor y la fecha inicial para comenzar.'}</Text></Table.Td></Table.Tr> : null}
        </Table.Tbody>
      </Table>
      </div>
      <Group justify="space-between" p="md" bg="yellow.2"><Text fw={800}>Saldo actual</Text><Text fw={800} size="xl">{money(account.balance)}</Text></Group>
    </Paper> : null}
    {account && opening ? <Text size="sm" c="dimmed">Cargos: {money(account.charges)} · Abonos: {money(account.payments)}. Los cargos suman y los abonos restan al saldo.</Text> : null}
    <Modal opened={open} onClose={() => !saving && setOpen(false)} title={type === 'OPENING' ? 'Registrar saldo inicial' : 'Agregar movimiento'} closeOnClickOutside={!saving} closeOnEscape={!saving}>
      <Stack><FormGrid>
        {type !== 'OPENING' ? <Select label="Tipo" value={type} onChange={value => setType(value as 'CHARGE' | 'PAYMENT')} allowDeselect={false} data={[{ value: 'CHARGE', label: 'Cargo · aumenta la deuda' }, { value: 'PAYMENT', label: 'Abono / descuento · reduce la deuda' }]} disabled={saving} /> : null}
        <TextInput label="Fecha" type="date" value={date} onChange={event => setDate(event.currentTarget.value)} min={type === 'OPENING' ? undefined : opening?.date?.slice(0,10)} required disabled={saving} />
        <NumberInput label="Valor (COP)" value={amount} onChange={setAmount} min={0} max={999999999999.99} decimalScale={2} thousandSeparator="." decimalSeparator="," allowNegative={false} required disabled={saving} />
        <TextInput label="Detalle" placeholder="Nómina, teléfono, préstamo…" value={detail} onChange={event => setDetail(event.currentTarget.value)} maxLength={500} required disabled={saving} data-full-width />
      </FormGrid>{saveError ? <Alert color="red">{saveError}</Alert> : null}<Group justify="flex-end"><Button variant="default" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void save()} loading={saving}>Guardar</Button></Group></Stack>
    </Modal>
  </Stack></Container>;
}
