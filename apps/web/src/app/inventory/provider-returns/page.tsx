'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Container, FileInput, Group, NumberInput, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconCamera, IconCheck, IconRefresh } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';

type PendingItem = {
  sourceLedgerId: string;
  sourceDocumentId: string;
  consecutive: string | null;
  docDate: string;
  customer: string | null;
  worksite: string | null;
  providerWarehouse: { id: string; name: string };
  type: 'SERIAL' | 'BULK';
  skuName: string | null;
  publicCode: string | null;
  serialOrEngine: string | null;
  description: string | null;
  pendingQuantity: number;
};

const errorMessage = (error: unknown) => error instanceof ApiError ? `${error.status}: ${error.message}` : error instanceof Error ? error.message : 'No se pudo completar la entrega.';

export default function ProviderReturnsPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [evidenceByGroup, setEvidenceByGroup] = useState<Record<string, File | null>>({});
  const [proofByGroup, setProofByGroup] = useState<Record<string, File | null>>({});
  const [notesByGroup, setNotesByGroup] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api<PendingItem[]>('/provider-returns/pending'));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; sourceDocumentId: string; provider: PendingItem['providerWarehouse']; consecutive: string | null; customer: string | null; worksite: string | null; items: PendingItem[] }>();
    items.forEach((item) => {
      const key = `${item.sourceDocumentId}:${item.providerWarehouse.id}`;
      const group = map.get(key) ?? { key, sourceDocumentId: item.sourceDocumentId, provider: item.providerWarehouse, consecutive: item.consecutive, customer: item.customer, worksite: item.worksite, items: [] };
      group.items.push(item);
      map.set(key, group);
    });
    return [...map.values()];
  }, [items]);

  const upload = async (documentId: string, category: string, file: File) => {
    const body = new FormData();
    body.append('category', category);
    body.append('files', file);
    await api(`/files/entities/DOCUMENT/${documentId}`, { method: 'POST', body });
  };

  const confirm = async (group: (typeof groups)[number]) => {
    const chosen = group.items.filter((item) => (selected[item.sourceLedgerId] ?? 0) > 0);
    const evidence = evidenceByGroup[group.key];
    const proof = proofByGroup[group.key];
    if (!chosen.length) return setError('Selecciona al menos un ítem de la DV.');
    if (!evidence) return setError('Toma la foto de evidencia de entrega.');
    if (!proof) return setError('Toma la foto del comprobante físico del proveedor.');
    setSubmittingKey(group.key);
    setError(null);
    setMessage(null);
    try {
      const receipt = await api<{ id: string; consecutive: string }>('/provider-returns', {
        method: 'POST',
        json: {
          sourceDocumentId: group.sourceDocumentId,
          providerWarehouseId: group.provider.id,
          notes: notesByGroup[group.key]?.trim() || undefined,
          items: chosen.map((item) => ({ sourceLedgerId: item.sourceLedgerId, quantity: selected[item.sourceLedgerId] })),
        },
      });
      await upload(receipt.id, 'EVIDENCIA_ENTREGA_PROVEEDOR', evidence);
      await upload(receipt.id, 'COMPROBANTE_RECEPCION_PROVEEDOR', proof);
      await api(`/provider-returns/${receipt.id}/confirm`, { method: 'POST' });
      setMessage(`${receipt.consecutive} confirmada. Los ítems ya están En bodega de ${group.provider.name}.`);
      setEvidenceByGroup((current) => ({ ...current, [group.key]: null }));
      setProofByGroup((current) => ({ ...current, [group.key]: null }));
      setNotesByGroup((current) => ({ ...current, [group.key]: '' }));
      setSelected({});
      await load();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmittingKey(null);
    }
  };

  return (
    <Container size="md" py="lg">
      <Group justify="space-between" mb="lg">
        <div><Title order={2}>Entregas a proveedor</Title><Text c="dimmed">Confirma equipos recogidos en una DV cuando el proveedor los recibe físicamente.</Text></div>
        <Button variant="light" leftSection={<IconRefresh size={16} />} loading={loading} onClick={() => void load()}>Actualizar</Button>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {message && <Alert color="green" mb="md">{message}</Alert>}
      {!loading && !error && !groups.length && <Paper withBorder p="xl"><Text ta="center" c="dimmed">No tienes devoluciones pendientes de entregar a proveedores.</Text></Paper>}
      <Stack gap="lg">
        {groups.map((group) => (
          <Paper key={group.key} withBorder radius="md" p="md">
            <Group justify="space-between" align="flex-start" mb="md">
              <div><Group gap="xs"><Title order={3}>{group.consecutive ?? 'DV sin consecutivo'}</Title><Badge color="yellow">En transición</Badge></Group><Text size="sm">{group.customer ?? 'Cliente'} · {group.worksite ?? 'Obra'}</Text></div>
              <div style={{ textAlign: 'right' }}><Text fw={700}>{group.provider.name}</Text><Text size="xs" c="dimmed">Bodega receptora</Text></div>
            </Group>
            <Stack gap="xs">
              {group.items.map((item) => {
                const quantity = selected[item.sourceLedgerId] ?? 0;
                return <Paper key={item.sourceLedgerId} withBorder p="sm" radius="sm">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Checkbox checked={quantity > 0} onChange={(event) => setSelected((current) => ({ ...current, [item.sourceLedgerId]: event.currentTarget.checked ? item.pendingQuantity : 0 }))} label={<div><Text fw={600}>{item.skuName ?? 'Equipo'}</Text><Text size="xs" c="dimmed">{item.publicCode || item.serialOrEngine || item.description || (item.type === 'BULK' ? `${item.pendingQuantity} pendientes` : 'Serial')}</Text></div>} />
                    {item.type === 'BULK' && quantity > 0 && <NumberInput w={100} min={1} max={item.pendingQuantity} value={quantity} onChange={(value) => setSelected((current) => ({ ...current, [item.sourceLedgerId]: Number(value) || 0 }))} />}
                  </Group>
                </Paper>;
              })}
            </Stack>
            <Stack mt="md">
              <FileInput accept="image/png,image/jpeg,image/webp" capture="environment" clearable required leftSection={<IconCamera size={16} />} label="Evidencia de entrega" description="Foto del equipo entregado físicamente en la bodega." value={evidenceByGroup[group.key] ?? null} onChange={(file) => setEvidenceByGroup((current) => ({ ...current, [group.key]: file }))} />
              <FileInput accept="image/png,image/jpeg,image/webp" capture="environment" clearable required leftSection={<IconCamera size={16} />} label="Comprobante del proveedor" description="Foto legible del recibo físico entregado por el proveedor." value={proofByGroup[group.key] ?? null} onChange={(file) => setProofByGroup((current) => ({ ...current, [group.key]: file }))} />
              <Textarea label="Observaciones" value={notesByGroup[group.key] ?? ''} onChange={(event) => setNotesByGroup((current) => ({ ...current, [group.key]: event.currentTarget.value }))} />
              <Button size="md" leftSection={<IconCheck size={18} />} loading={submittingKey === group.key} onClick={() => void confirm(group)}>Confirmar entrega en {group.provider.name}</Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
}
