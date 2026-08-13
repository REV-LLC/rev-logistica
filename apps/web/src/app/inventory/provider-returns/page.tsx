'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Container, FileInput, Group, NumberInput, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconCamera, IconCheck, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { api, ApiError } from '@/lib/api';

type PendingItem = {
  sourceLedgerId: string;
  sourceDocumentId: string;
  consecutive: string | null;
  docDate: string;
  customer: string | null;
  worksite: string | null;
  providerWarehouse: { id: string; name: string };
  custodyWarehouse: { id: string; name: string } | null;
  logisticsStatus: 'TRANSIT' | 'IN_REV_WAREHOUSE';
  type: 'SERIAL' | 'BULK';
  skuName: string | null;
  publicCode: string | null;
  serialOrEngine: string | null;
  description: string | null;
  pendingQuantity: number;
};

type ReturnGroup = {
  key: string;
  sourceDocumentId: string;
  provider: PendingItem['providerWarehouse'];
  consecutive: string | null;
  docDate: string;
  customer: string | null;
  worksite: string | null;
  items: PendingItem[];
};

const errorMessage = (error: unknown) => error instanceof ApiError ? `${error.status}: ${error.message}` : error instanceof Error ? error.message : 'No se pudo completar la entrega.';
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

export default function ProviderReturnsPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [evidenceByGroup, setEvidenceByGroup] = useState<Record<string, File | null>>({});
  const [proofByGroup, setProofByGroup] = useState<Record<string, File | null>>({});
  const [notesByGroup, setNotesByGroup] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
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
    const map = new Map<string, ReturnGroup>();
    items.forEach((item) => {
      const key = `${item.sourceDocumentId}:${item.providerWarehouse.id}`;
      const group = map.get(key) ?? { key, sourceDocumentId: item.sourceDocumentId, provider: item.providerWarehouse, consecutive: item.consecutive, docDate: item.docDate, customer: item.customer, worksite: item.worksite, items: [] };
      group.items.push(item);
      map.set(key, group);
    });
    return [...map.values()];
  }, [items]);

  const activeGroup = useMemo(
    () => groups.find((group) => group.key === activeGroupKey) ?? null,
    [activeGroupKey, groups],
  );

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
      setActiveGroupKey(null);
      await load();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmittingKey(null);
    }
  };

  const groupColumns: DataTableColumn<ReturnGroup>[] = [
    {
      id: 'document',
      header: 'Devolución',
      width: '16%',
      mobile: { priority: 'primary' },
      cell: (group) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={700}>{group.consecutive ?? 'Sin consecutivo'}</Text>
            <Text size="xs" c="dimmed" mt={3}>{dateFormatter.format(new Date(group.docDate))}</Text>
          </div>
          <Badge hiddenFrom="md" color={group.items.some((item) => item.logisticsStatus === 'IN_REV_WAREHOUSE') ? 'blue' : 'yellow'} variant="light">
            {group.items.some((item) => item.logisticsStatus === 'IN_REV_WAREHOUSE') ? 'En bodega REV' : 'En transición'}
          </Badge>
        </Group>
      ),
    },
    {
      id: 'customer',
      header: 'Cliente / obra',
      width: '24%',
      mobile: { label: 'Cliente / obra', priority: 'detail' },
      cell: (group) => (
        <div>
          <Text size="sm" fw={500}>{group.customer ?? 'Cliente'}</Text>
          <Text size="xs" c="dimmed">{group.worksite ?? 'Sin obra'}</Text>
        </div>
      ),
    },
    {
      id: 'provider',
      header: 'Proveedor',
      width: '20%',
      mobile: { label: 'Proveedor', priority: 'detail' },
      cell: (group) => <Text size="sm" fw={600}>{group.provider.name}</Text>,
    },
    {
      id: 'status',
      header: 'Estado',
      width: '16%',
      mobile: false,
      cell: (group) => {
        const inRevWarehouse = group.items.some((item) => item.logisticsStatus === 'IN_REV_WAREHOUSE');
        return <Badge color={inRevWarehouse ? 'blue' : 'yellow'} variant="light">{inRevWarehouse ? 'En bodega REV' : 'En transición'}</Badge>;
      },
    },
    {
      id: 'items',
      header: 'Ítems',
      align: 'center',
      width: '8%',
      mobile: { label: 'Ítems', priority: 'detail' },
      cell: (group) => group.items.length,
    },
    {
      id: 'process',
      header: 'Acción',
      align: 'right',
      width: '16%',
      mobile: { priority: 'primary' },
      cell: (group) => (
        <Button
          size="xs"
          variant={activeGroupKey === group.key ? 'filled' : 'light'}
          rightSection={<IconChevronRight size={14} />}
          onClick={() => setActiveGroupKey(group.key)}
        >
          {activeGroupKey === group.key ? 'Seleccionada' : 'Procesar'}
        </Button>
      ),
    },
  ];

  return (
    <Container size="md" py="lg">
      <Group justify="space-between" mb="lg">
        <div><Title order={2}>Entregas a proveedor</Title><Text c="dimmed">Confirma equipos recogidos en una DV cuando el proveedor los recibe físicamente.</Text></div>
        <Button variant="light" leftSection={<IconRefresh size={16} />} loading={loading} onClick={() => void load()}>Actualizar</Button>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {message && <Alert color="green" mb="md">{message}</Alert>}
      {!error ? (
        <Paper withBorder radius="md" mb="lg" p={{ base: 'sm', md: 'md' }}>
          <EntityDataTable
            rows={groups}
            columns={groupColumns}
            getRowId={(group) => group.key}
            loading={loading}
            tableMinWidth={760}
            emptyState={{
              title: 'No hay devoluciones pendientes',
              description: 'Las entregas pendientes a proveedores aparecerán aquí.',
            }}
          />
        </Paper>
      ) : null}
      {activeGroup && <Paper withBorder radius="md" p="md">
            <Group justify="space-between" align="flex-start" mb="md">
              <div><Group gap="xs"><Title order={3}>{activeGroup.consecutive ?? 'DV sin consecutivo'}</Title><Badge color={activeGroup.items.some((item) => item.logisticsStatus === 'IN_REV_WAREHOUSE') ? 'blue' : 'yellow'}>{activeGroup.items.some((item) => item.logisticsStatus === 'IN_REV_WAREHOUSE') ? 'En bodega REV' : 'En transición'}</Badge></Group><Text size="sm">{activeGroup.customer ?? 'Cliente'} · {activeGroup.worksite ?? 'Obra'}</Text>{activeGroup.items[0]?.custodyWarehouse ? <Text size="xs" c="dimmed">Custodia actual: {activeGroup.items[0].custodyWarehouse.name}</Text> : null}</div>
              <div style={{ textAlign: 'right' }}><Text fw={700}>{activeGroup.provider.name}</Text><Text size="xs" c="dimmed">Bodega receptora</Text></div>
            </Group>
            <Stack gap="xs">
              {activeGroup.items.map((item) => {
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
              <FileInput accept="image/png,image/jpeg,image/webp" capture="environment" clearable required leftSection={<IconCamera size={16} />} label="Evidencia de entrega" description="Foto del equipo entregado físicamente en la bodega." value={evidenceByGroup[activeGroup.key] ?? null} onChange={(file) => setEvidenceByGroup((current) => ({ ...current, [activeGroup.key]: file }))} />
              <FileInput accept="image/png,image/jpeg,image/webp" capture="environment" clearable required leftSection={<IconCamera size={16} />} label="Comprobante del proveedor" description="Foto legible del recibo físico entregado por el proveedor." value={proofByGroup[activeGroup.key] ?? null} onChange={(file) => setProofByGroup((current) => ({ ...current, [activeGroup.key]: file }))} />
              <Textarea label="Observaciones" value={notesByGroup[activeGroup.key] ?? ''} onChange={(event) => setNotesByGroup((current) => ({ ...current, [activeGroup.key]: event.currentTarget.value }))} />
              <Button size="md" leftSection={<IconCheck size={18} />} loading={submittingKey === activeGroup.key} onClick={() => void confirm(activeGroup)}>Confirmar entrega en {activeGroup.provider.name}</Button>
            </Stack>
          </Paper>}
    </Container>
  );
}
