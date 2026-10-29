'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Modal, NumberInput, Stack, Table, Tabs, Text, Textarea } from '@mantine/core';
import { IconHistory, IconPencil, IconDeviceFloppy } from '@tabler/icons-react';
import { api } from '@/lib/api';

type Money = string | number | null;
export type PriceListReference = { id: string; name: string; price: Money; replacementValue: Money };
type PriceChange = {
  id: string; oldPrice: Money; newPrice: Money; oldReplacementValue: Money; newReplacementValue: Money;
  reason: string; changedByName: string; changedByEmail: string; createdAt: string;
};
type History = { items: PriceChange[]; nextCursor: string | null };
const formatMoney = (value: Money) => value === null ? 'Sin precio' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';
const toMoney = (value: string | number) => value === '' ? null : String(value);

export default function PriceListPricingModal({ reference, initialTab, onClose, onSaved }: {
  reference: PriceListReference; initialTab: 'edit' | 'history'; onClose: () => void;
  onSaved: (updated: PriceListReference) => void;
}) {
  const [tab, setTab] = useState<string | null>(initialTab);
  const [price, setPrice] = useState<string | number>(reference.price ?? '');
  const [replacement, setReplacement] = useState<string | number>(reference.replacementValue ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState<History | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [reload, setReload] = useState(0);
  const historyRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (tab !== 'history') return;
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoryLoading(true); setHistoryError('');
    api<History>(`/skus/${reference.id}/price-history`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setHistory(data); })
      .catch(error => { if (!controller.signal.aborted) setHistoryError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => { controller.abort(); historyRequest.current?.abort(); };
  }, [reference.id, tab, reload]);

  useEffect(() => () => historyRequest.current?.abort(), []);

  async function moreHistory() {
    if (!history?.nextCursor || historyLoading) return;
    const cursor = history.nextCursor;
    const controller = new AbortController();
    historyRequest.current?.abort(); historyRequest.current = controller;
    setHistoryLoading(true); setHistoryError('');
    try {
      const data = await api<History>(`/skus/${reference.id}/price-history?cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal });
      if (!controller.signal.aborted) setHistory(previous => ({ items: [...(previous?.items ?? []), ...data.items], nextCursor: data.nextCursor }));
    } catch (error) { if (!controller.signal.aborted) setHistoryError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setHistoryLoading(false); }
  }

  async function save() {
    if (pending.current) return;
    if (reason.trim().length < 5) { setSaveError('Escribe un motivo de al menos 5 caracteres.'); return; }
    pending.current = true; setSaving(true); setSaveError('');
    try {
      const updated = await api<Pick<PriceListReference, 'id' | 'price' | 'replacementValue'>>(`/skus/${reference.id}/pricing`, {
        method: 'PATCH', json: {
          price: toMoney(price), replacementValue: toMoney(replacement), reason: reason.trim(),
          expected: { price: reference.price === null ? null : String(reference.price), replacementValue: reference.replacementValue === null ? null : String(reference.replacementValue) },
        },
      });
      onSaved({ ...reference, ...updated });
    } catch (error) { setSaveError(errorMessage(error)); }
    finally { pending.current = false; setSaving(false); }
  }

  return <Modal opened onClose={() => { if (!pending.current) onClose(); }} title={reference.name} size="lg" centered closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
    <Tabs value={tab} onChange={value => { if (!saving) setTab(value); }}>
      <Tabs.List mb="md">
        <Tabs.Tab value="edit" leftSection={<IconPencil size={16} />} disabled={saving}>Editar precios</Tabs.Tab>
        <Tabs.Tab value="history" leftSection={<IconHistory size={16} />} disabled={saving}>Historial</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="edit">
        <Stack>
          {saveError ? <Alert color="red" role="alert">{saveError}</Alert> : null}
          <NumberInput label="Precio de alquiler (COP)" value={price} onChange={setPrice} min={0} max={999999999999.99} decimalScale={2} thousandSeparator="." decimalSeparator="," disabled={saving} />
          <NumberInput label="Valor de reposición (COP)" value={replacement} onChange={setReplacement} min={0} max={999999999999.99} decimalScale={2} thousandSeparator="." decimalSeparator="," disabled={saving} />
          <Textarea label="Motivo del cambio" required value={reason} onChange={event => setReason(event.currentTarget.value)} maxLength={500} minRows={2} disabled={saving} />
          <Group justify="flex-end"><Button variant="default" onClick={onClose} disabled={saving}>Cancelar</Button><Button leftSection={<IconDeviceFloppy size={16} />} onClick={() => void save()} loading={saving}>Guardar cambios</Button></Group>
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="history">
        <Stack>
          {historyError ? <Alert color="red" role="alert">{historyError}<Button variant="subtle" onClick={() => setReload(value => value + 1)}>Reintentar</Button></Alert> : null}
          {historyLoading && !history ? <Loader aria-label="Cargando historial" /> : null}
          {history && !history.items.length ? <Text c="dimmed">No hay cambios registrados desde la activación del historial.</Text> : null}
          {history?.items.map(change => <section key={change.id} style={{ borderBottom: '1px solid var(--mantine-color-default-border)', paddingBottom: 16 }}>
            <Text fw={700}>{change.changedByName}</Text>
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{change.changedByName !== change.changedByEmail ? `${change.changedByEmail} · ` : ''}{new Date(change.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</Text>
            <Table className="table-mobile-fit" mt="sm" layout="fixed" styles={{ td: { overflowWrap: 'anywhere' }, th: { overflowWrap: 'anywhere' } }}>
              <Table.Thead><Table.Tr><Table.Th>Concepto</Table.Th><Table.Th>Anterior</Table.Th><Table.Th>Nuevo</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr><Table.Td>Alquiler</Table.Td><Table.Td>{formatMoney(change.oldPrice)}</Table.Td><Table.Td>{formatMoney(change.newPrice)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>Reposición</Table.Td><Table.Td>{formatMoney(change.oldReplacementValue)}</Table.Td><Table.Td>{formatMoney(change.newReplacementValue)}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
            <Text mt="sm" size="sm" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{change.reason}</Text>
          </section>)}
          {history?.nextCursor ? <Button variant="default" onClick={() => void moreHistory()} loading={historyLoading}>Cargar más</Button> : null}
          <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cerrar</Button></Group>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  </Modal>;
}
