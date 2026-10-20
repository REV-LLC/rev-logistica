'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Alert, Button, Container, Group, Loader, Modal, NumberInput, Paper, SegmentedControl, Stack, Table, Text, Textarea, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { IconArrowLeft, IconPencil, IconPlus } from '@tabler/icons-react';
import { api } from '@/lib/api';
import FormGrid from '@/components/FormGrid';
import EmployeePhotoControl from '@/components/EmployeePhotoControl';
import LoanDescriptionModal from './LoanDescriptionModal';
import type { LoanAccount as Account, LoanEntry as Entry } from './loan-types';
import styles from './loans.module.css';
import { loanMovementPresentation, type LoanDisplaySettings } from '@/lib/loan-presentation';

const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value));
const dateLabel = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('/') : 'Sin fecha registrada';
const entryLabel = (type: Entry['type']) => type === 'OPENING' ? 'Saldo inicial' : type === 'PAYMENT' ? 'Abono / descuento' : 'Cargo';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function EmployeeLoansPanel({ employeeId, embedded = false, selfService = false }: { employeeId: string; embedded?: boolean; selfService?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [paymentsPositive, setPaymentsPositive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [type, setType] = useState<Entry['type']>('CHARGE');
  const [date, setDate] = useState(today);
  const [detail, setDetail] = useState('');
  const [amount, setAmount] = useState<string | number>('');
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const request = useRef<{ id: string; payload: string } | null>(null);
  const submitting = useRef(false);
  async function load(signal?: AbortSignal) {
    setLoading(true); setError(null);
    try {
      const [result, display] = await Promise.all([
        api<Account>(selfService ? '/employee-portal/loans' : `/employees/${employeeId}/loans`, { signal }),
        api<LoanDisplaySettings>('/settings/loan-display', { signal }),
      ]);
      if (!signal?.aborted) { setAccount(result); setPaymentsPositive(display.paymentsPositive); }
    }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la tarjeta.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [employeeId, selfService]);
  const opening = account?.entries.find(entry => entry.type === 'OPENING');
  const entries = account?.entries ?? [];
  const selectedPresentation = loanMovementPresentation(type, paymentsPositive);
  const fillerRowCount = Math.max(0, 5 - Math.max(entries.length, 1));
  function openForm() {
    if (selfService) return;
    setType(opening ? 'CHARGE' : 'OPENING'); setDate(today()); setDetail(opening ? '' : 'Saldo inicial'); setAmount(''); setSaveError(null); request.current = null; setOpen(true);
  }
  async function save() {
    if (selfService || submitting.current) return;
    if (!date || !detail.trim() || amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0 || (type !== 'OPENING' && Number(amount) === 0)) {
      setSaveError('Completa la fecha, la descripción y un valor válido.'); return;
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
  return <Container size="md" fluid={embedded} p={embedded ? 0 : undefined} py={embedded ? 0 : 'xl'}><Stack gap="lg">
    {!embedded ? <Button component={Link} href="/employees" variant="subtle" leftSection={<IconArrowLeft size={16} />} w="fit-content">Empleados</Button> : null}
    {!embedded ? <Title order={1}>Préstamos y deudas</Title> : null}
    {loading ? <Loader aria-label="Cargando tarjeta" /> : null}
    {error ? <Alert color="red">{error}<Button variant="subtle" onClick={() => void load()}>Reintentar</Button></Alert> : null}
    {account ? <Paper radius="md" className={styles.card}>
      {!embedded ? <Group justify="space-between" wrap="nowrap" p="md" className={styles.employeeHeader}>
        <Text fw={700} c="inherit" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{account.employee.name} {account.employee.lastName}</Text>
        <EmployeePhotoControl employee={account.employee} size={64} />
      </Group> : null}
      <div className={`${styles.ledgerBody} ${embedded ? styles.embeddedLedger : ''}`}>
      <div role="region" aria-label="Movimientos del préstamo" tabIndex={0}
        style={{ maxHeight: 'min(420px, 50dvh)', overflow: 'auto', overscrollBehavior: 'contain' }}>
      <Table stickyHeader stickyHeaderOffset={0} horizontalSpacing={6} verticalSpacing={3.5} className={`table-mobile-fit ${styles.movementsTable}`} style={{ tableLayout: 'fixed' }} striped={!embedded} withRowBorders>
        <Table.Thead><Table.Tr><Table.Th className={styles.dateColumn}>Fecha</Table.Th><Table.Th className={styles.descriptionColumn}>Descripción</Table.Th><Table.Th className={styles.amountColumn} ta="right">Valor</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{entries.map(entry => {
          const presentation = loanMovementPresentation(entry.type, paymentsPositive);
          const expanded = expandedEntryId === entry.id;
          const detailId = `loan-entry-detail-${entry.id}`;
          return <Fragment key={entry.id}><Table.Tr>
          <Table.Td className={styles.dateCell}><span className={entry.date ? styles.dateValue : undefined}>{dateLabel(entry.date)}</span></Table.Td>
          <Table.Td style={{ overflowWrap: 'anywhere' }}>
            <Group gap={4} align="flex-start" wrap="nowrap" className={styles.entryDescription}>
              <UnstyledButton className={styles.descriptionTrigger} aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
                aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalle: ${entry.detail}`}
                onClick={() => setExpandedEntryId(current => current === entry.id ? null : entry.id)}>
                <Text component="span" size="sm" fw={500} className={styles.description}>{entry.detail}</Text>
                <Text component="span" size="xs" c="dimmed" className={styles.entryType}>{entryLabel(entry.type)}</Text>
              </UnstyledButton>
              {!selfService ? <Tooltip label="Editar descripción" withArrow><ActionIcon variant="subtle" color="gray" size="md" className={styles.editAction}
                aria-label={`Editar descripción del ${entry.type === 'OPENING' ? 'saldo inicial' : entry.type === 'PAYMENT' ? 'abono' : 'cargo'} del ${dateLabel(entry.date)} por ${money(entry.amount)}`}
                onClick={() => setEditingEntry(entry)}><IconPencil size={17} /></ActionIcon></Tooltip> : null}
            </Group>
          </Table.Td>
          <Table.Td ta="right" className={styles.amountCell} c={presentation.color}>{presentation.sign} {money(entry.amount)}</Table.Td>
        </Table.Tr>
        {expanded ? <Table.Tr className={styles.expandedRow}><Table.Td colSpan={3}>
          <section id={detailId} className={styles.entryDetail} aria-label={`Detalle del movimiento: ${entry.detail}`}>
            <Group justify="space-between" gap="xs" wrap="wrap">
              <div><Text size="xs" c="dimmed">{entryLabel(entry.type)}</Text><Text size="sm">{dateLabel(entry.date)}</Text></div>
              <Text size="sm" fw={600} c={presentation.color} className={styles.detailAmount}>{presentation.sign} {money(entry.amount)}</Text>
            </Group>
            <Text size="sm" className={styles.fullDescription}>{entry.detail}</Text>
            {!selfService ? <Button variant="subtle" size="compact-sm" w="fit-content" onClick={() => setEditingEntry(entry)}>Editar descripción</Button> : null}
          </section>
        </Table.Td></Table.Tr> : null}
        </Fragment>; })}
        {!entries.length ? <Table.Tr><Table.Td colSpan={3}><Text size="sm" c="dimmed" ta="center">{selfService ? 'No tienes movimientos de préstamos registrados.' : 'Registra el valor y la fecha inicial para comenzar.'}</Text></Table.Td></Table.Tr> : null}
        {Array.from({ length: fillerRowCount }, (_, index) => <Table.Tr key={`empty-${index}`} className={styles.emptyRow} aria-hidden="true">
          <Table.Td colSpan={3} />
        </Table.Tr>)}
        </Table.Tbody>
      </Table>
      </div>
      <Group justify="space-between" p="md" className={styles.balance}><Text fw={800}>Saldo actual</Text><Text fw={800} size="xl">{money(account.balance)}</Text></Group>
      </div>
    </Paper> : null}
    {account && opening ? <Text size="sm" c="dimmed">Cargos: {money(account.charges)} · Abonos: {money(account.payments)}. Los cargos suman y los abonos restan al saldo.</Text> : null}
    {!selfService ? <div className={styles.addMovementFooter}>
      <Button className={styles.addMovementButton} onClick={openForm} disabled={!account || loading} leftSection={<IconPlus size={18} />}>{opening ? 'Agregar movimiento' : 'Registrar saldo inicial'}</Button>
    </div> : null}
    <Modal opened={!selfService && open} onClose={() => !saving && setOpen(false)} title={type === 'OPENING' ? 'Registrar saldo inicial' : 'Agregar movimiento'}
      centered radius="md" closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <Stack gap="lg">
          {account ? <Text size="sm" fw={600}>{account.employee.name} {account.employee.lastName}</Text> : null}
          {type !== 'OPENING' ? <Stack gap={6}>
            <SegmentedControl aria-label="Tipo de movimiento" value={type} onChange={value => setType(value as 'CHARGE' | 'PAYMENT')}
              disabled={saving} fullWidth size="md" radius="md" data={(['CHARGE', 'PAYMENT'] as const).map(movementType => {
                  const presentation = loanMovementPresentation(movementType, paymentsPositive);
                  return { value: movementType, label: <span className={styles.movementChoice}><Text component="span" fw={700} c={presentation.color} aria-hidden>{presentation.sign}</Text>{movementType === 'CHARGE' ? 'Cargo' : 'Abono'}</span> };
                })} />
            <Text size="xs" c="dimmed" aria-live="polite">{type === 'PAYMENT' ? 'Reduce la deuda' : 'Aumenta la deuda'}</Text>
          </Stack> : null}
          <FormGrid>
            <TextInput label="Fecha" type="date" size="md" value={date} onChange={event => setDate(event.currentTarget.value)} min={type === 'OPENING' ? undefined : opening?.date?.slice(0,10)} required disabled={saving} />
            <NumberInput label="Valor (COP)" placeholder="0" size="md" value={amount} onChange={setAmount} min={0} max={999999999999.99} decimalScale={2} thousandSeparator="." decimalSeparator="," allowNegative={false} required disabled={saving}
              leftSection={<Text component="span" c={selectedPresentation.color} fw={700} aria-hidden>{selectedPresentation.sign}</Text>} />
          </FormGrid>
          <Textarea label="Descripción" placeholder="Ej. Préstamo para teléfono" value={detail} onChange={event => setDetail(event.currentTarget.value)}
            maxLength={500} required disabled={saving} autosize minRows={2} maxRows={5} />
          {saveError ? <Alert color="red" role="alert">{saveError}</Alert> : null}
          <Group justify="flex-end" className={styles.movementActions}>
            <Button type="button" size="md" variant="default" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" size="md" loading={saving}>{type === 'OPENING' ? 'Registrar saldo inicial' : type === 'PAYMENT' ? 'Registrar abono' : 'Registrar cargo'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
    {!selfService && editingEntry ? <LoanDescriptionModal key={editingEntry.id} employeeId={employeeId} entry={editingEntry}
      onClose={() => setEditingEntry(null)} onSaved={updated => { setAccount(updated); setEditingEntry(null); }} /> : null}
  </Stack></Container>;
}
