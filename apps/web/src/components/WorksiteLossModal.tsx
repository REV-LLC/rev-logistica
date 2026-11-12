'use client';
import { useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { api } from '@/lib/api';
import { getCurrentUserSession } from '@/lib/auth';

export type WorksiteLoss = { id: string; skuId: string; assetId: string | null; ownerWarehouseId: string; quantity: string; effectiveAt: string; reason: string; responsible: string; createdBy: string; createdAt: string; annexChargeKey: string | null };
export const lossDate = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
};

export default function WorksiteLossModal({ customerWorksiteId, skuId, assetId, name, owners, onClose, onSaved }: {
  customerWorksiteId: string; skuId: string; assetId?: string; name: string;
  owners: Array<{ id: string; name: string; quantity: number }>;
  onClose: () => void; onSaved: () => void;
}) {
  const session = getCurrentUserSession();
  const [requestId] = useState(() => crypto.randomUUID());
  const [ownerId, setOwnerId] = useState<string | null>(owners.length === 1 ? owners[0].id : null);
  const [quantity, setQuantity] = useState<string | number>(1);
  const [date, setDate] = useState(() => lossDate(new Date().toISOString()));
  const [reason, setReason] = useState('');
  const [responsible, setResponsible] = useState(() => session?.name || [session?.firstName, session?.lastName].filter(Boolean).join(' ') || session?.email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = owners.find(owner => owner.id === ownerId);
  const valid = selected && Number.isInteger(Number(quantity)) && Number(quantity) > 0 && Number(quantity) <= selected.quantity && date && date <= lossDate(new Date().toISOString()) && reason.trim().length >= 5 && responsible.trim().length >= 2;
  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      await api('/inventory/worksite-losses', { method: 'POST', json: {
        requestId, customerWorksiteId, skuId, ...(assetId ? { assetId } : {}), ownerWarehouseId: ownerId,
        quantity: String(quantity), date, reason: reason.trim(), responsible: responsible.trim(),
      } });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la pérdida'); }
    finally { setSaving(false); }
  }
  return <Modal opened onClose={() => { if (!saving) onClose(); }} title="Registrar pérdida" closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
    <Stack>
      <Text fw={700}>{name}</Text>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Select label="Dueño del inventario" required data={owners.map(owner => ({ value: owner.id, label: `${owner.name} · ${owner.quantity} en obra` }))} value={ownerId} onChange={setOwnerId} disabled={saving} />
      <NumberInput label="Cantidad perdida" required value={quantity} onChange={setQuantity} min={1} max={selected?.quantity ?? 999999} allowDecimal={false} disabled={saving || Boolean(assetId)} />
      <TextInput label="Fecha de pérdida" required type="date" max={lossDate(new Date().toISOString())} value={date} onChange={event => setDate(event.currentTarget.value)} disabled={saving} />
      <Textarea label="Motivo" required minRows={3} maxLength={500} value={reason} onChange={event => setReason(event.currentTarget.value)} disabled={saving} />
      <TextInput label="Responsable del reporte" required maxLength={160} value={responsible} onChange={event => setResponsible(event.currentTarget.value)} disabled={saving} />
      <Alert color="orange">Se descontarán estas unidades de la obra sin ingresarlas a bodega. Su alquiler dejará de cobrarse desde la fecha indicada. La baja conserva su historial y no genera por sí sola un cobro de reposición.</Alert>
      <Group justify="flex-end"><Button variant="default" disabled={saving} onClick={onClose}>Cancelar</Button><Button color="red" loading={saving} disabled={!valid} onClick={() => void save()}>Confirmar pérdida</Button></Group>
    </Stack>
  </Modal>;
}
