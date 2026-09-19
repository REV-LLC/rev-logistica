'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, FileButton, Group, Loader, Modal, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPhoto, IconUpload } from '@tabler/icons-react';
import AppImage from '@/components/AppImage';
import type { BulkItem } from '@/components/InventoryDisplay';
import type { LedgerItem } from '@/components/LedgerTable';
import { api } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';

const movementLabels: Record<string, string> = { IN: 'Entrada a bodega', OUT: 'Salida a obra', TRANSIT: 'En tránsito', ON_SITE: 'Entrega en obra', ADJUST: 'Ajuste de inventario' };

export default function BulkInventoryDetails({ rows, imageUrl, warehouseId, customerWorksiteId, isWorksiteView, onClose, onImageSaved }: {
  rows: BulkItem[]; imageUrl: string | null; warehouseId?: string; customerWorksiteId?: string;
  isWorksiteView: boolean; onClose: () => void; onImageSaved: (skuId: string, url: string) => void;
}) {
  const item = rows[0];
  const skuId = item.skuId;
  const name = item.name ?? item.skuName ?? 'Ítem';
  const mobile = useMediaQuery('(max-width: 48em)');
  const role = getCurrentUserRole();
  const canEdit = role === 'ADMIN' || role === 'OFFICE';
  const [brokenImage, setBrokenImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<string | null>(null);
  const [movements, setMovements] = useState<LedgerItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const owners = [...new Map(rows.map(row => [row.ownerWarehouseId ?? 'unknown', row.ownerWarehouseName ?? 'Dueño sin identificar'])).entries()].map(([id, ownerName]) => ({
    id, name: ownerName,
    quantity: rows.filter(row => (row.ownerWarehouseId ?? 'unknown') === id).reduce((sum, row) => sum + row.quantity, 0),
    worksiteQuantity: rows.filter(row => (row.ownerWarehouseId ?? 'unknown') === id).reduce((sum, row) => sum + (row.worksiteQuantity ?? 0), 0),
  }));
  const quantity = owners.reduce((sum, owner) => sum + owner.quantity, 0);
  const worksiteQuantity = owners.reduce((sum, owner) => sum + owner.worksiteQuantity, 0);
  const ownersInStock = owners.filter(owner => owner.quantity > 0).length;
  useEffect(() => setBrokenImage(false), [imageUrl]);

  async function loadMovements(nextCursor?: string | null) {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    setLedgerError(null);
    const query = new URLSearchParams({ skuId, take: '20' });
    if (warehouseId) query.set('warehouseId', warehouseId);
    if (customerWorksiteId) query.set('customerWorksiteId', customerWorksiteId);
    if (movementType) query.set('movementType', movementType);
    if (nextCursor) query.set('cursor', nextCursor);
    try {
      const result = await api<{ items: LedgerItem[]; nextCursor: string | null }>(`/inventory/ledger?${query}`, { signal: request.signal });
      if (request.signal.aborted) return;
      setMovements(previous => nextCursor ? [...previous, ...result.items] : result.items);
      setCursor(result.nextCursor);
    } catch (cause) {
      if (!request.signal.aborted) setLedgerError(cause instanceof Error ? cause.message : 'No se pudieron cargar los movimientos.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    setMovements([]);
    setCursor(null);
    void loadMovements();
    return () => requestRef.current?.abort();
    // The request is restarted whenever its scope or filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuId, warehouseId, customerWorksiteId, movementType]);
  async function uploadImage(file: File | null) {
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Selecciona una imagen JPG, PNG o WEBP de hasta 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('files', file);
      body.append('category', 'PHOTO');
      body.append('displayName', `Imagen de ${name}`);
      const result = await api<{ files: Array<{ storageKey: string }> }>(`/files/entities/SKU/${skuId}`, { method: 'POST', body });
      const url = result.files[0]?.storageKey;
      if (!url) throw new Error('No se recibió la imagen.');
      await api(`/skus/${skuId}`, { method: 'PATCH', json: { imageUrl: url } });
      onImageSaved(skuId, url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la imagen. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={name} size="xl" fullScreen={mobile} radius={mobile ? 0 : 'lg'}>
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          <Paper withBorder radius="md" p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
            {imageUrl && !brokenImage ? <AppImage src={imageUrl} alt={name} width={480} height={280} sizes="(max-width: 48em) 90vw, 420px" style={{ width: '100%', height: 240, objectFit: 'contain' }} onError={() => setBrokenImage(true)} />
              : <Stack align="center" justify="center" h={240} c="dimmed"><IconPhoto size={48} /><Text>Sin imagen</Text></Stack>}
            {canEdit ? <FileButton accept="image/png,image/jpeg,image/webp" onChange={uploadImage}>
              {props => <Button {...props} fullWidth mt="sm" variant="light" loading={uploading} leftSection={<IconUpload size={16} />}>{imageUrl ? 'Cambiar imagen' : 'Agregar imagen'}</Button>}
            </FileButton> : null}
            {canEdit ? <Text size="xs" c="dimmed" mt="xs">La imagen se comparte para esta referencia en todas las bodegas.</Text> : null}
            {error ? <Alert color="red" mt="sm">{error}</Alert> : null}
          </Paper>
          <Stack gap="md">
            <div><Text size="sm" c="dimmed">{item.category ?? 'Inventario masivo'}</Text><Title order={2}>{name}</Title></div>
            <SimpleGrid cols={2}>
              <Paper withBorder p="md" radius="md"><Text size="sm" c="dimmed">{isWorksiteView ? 'En esta obra' : 'En esta bodega'}</Text><Text size="xl" fw={700} c={quantity < 0 ? 'red' : 'teal'}>{quantity.toLocaleString('es-CO')}</Text></Paper>
              <Paper withBorder p="md" radius="md"><Text size="sm" c="dimmed">Dueños con existencias</Text><Text size="xl" fw={700}>{ownersInStock}</Text></Paper>
            </SimpleGrid>
            {!isWorksiteView ? <Text>En obras: <strong>{worksiteQuantity.toLocaleString('es-CO')}</strong></Text> : null}
            <Text size="sm" c="dimmed">Cobro: {item.chargeType === 'HOUR' ? `Por hora${Number(item.minimumChargeHours) > 0 ? ` · mínimo ${item.minimumChargeHours} h` : ''}` : item.chargeType === 'DAY' ? 'Por día' : 'Sin definir'}</Text>
            <Text size="sm" c="dimmed">Cada cantidad conserva su dueño al realizar movimientos.</Text>
          </Stack>
        </SimpleGrid>
        <section>
          <Title order={3} mb="sm">Existencias por dueño</Title>
          <Text size="sm" c="dimmed" mb="md">Proveedores y existencias propias de esta referencia.</Text>
          <Stack gap="xs">{owners.map(owner => <Paper key={owner.id} withBorder p="md" radius="md">
            <Group justify="space-between"><Text fw={600}>{owner.name}</Text><Badge color={owner.quantity < 0 ? 'red' : 'teal'} variant="light">{isWorksiteView ? 'En obra' : 'En bodega'}: {owner.quantity}</Badge></Group>
            {!isWorksiteView ? <Text size="sm" c="dimmed" mt={4}>En obras: {owner.worksiteQuantity}</Text> : null}
            {rows.filter(row => (row.ownerWarehouseId ?? 'unknown') === owner.id).flatMap(row => row.worksiteLocations ?? []).map((location, index) => <Group key={`${location.customerWorksiteId}-${index}`} justify="space-between" mt="xs"><Text size="sm">{location.worksiteName}{location.customerName ? ` · ${location.customerName}` : ''}</Text><Text size="sm" fw={600}>{location.quantity}</Text></Group>)}
          </Paper>)}</Stack>
        </section>
        <section>
          <Group justify="space-between" mb="sm"><Title order={3}>Movimientos</Title><Select aria-label="Filtrar movimientos" placeholder="Todos los movimientos" clearable value={movementType} onChange={setMovementType} data={Object.entries(movementLabels).map(([value, label]) => ({ value, label }))} /></Group>
          <Text size="sm" c="dimmed" mb="md">{warehouseId ? 'Historial de esta referencia en la bodega consultada.' : customerWorksiteId ? 'Historial de esta referencia en la obra consultada.' : 'Historial de esta referencia en todas las ubicaciones.'}</Text>
          {ledgerError ? <Alert color="red" mb="sm">{ledgerError}<Button variant="subtle" onClick={() => void loadMovements(cursor)}>Reintentar</Button></Alert> : null}
          <Stack gap="xs">{movements.map(movement => <Paper key={movement.id} withBorder radius="md" p="md">
            <Group justify="space-between"><Text fw={600}>{movement.isOpeningBalance ? 'Saldo inicial' : movementLabels[movement.movementType] ?? 'Movimiento de inventario'}</Text><Text fw={700}>{Number(movement.quantity).toLocaleString('es-CO')}</Text></Group>
            <Text size="sm" c="dimmed">{new Date(movement.effectiveAt ?? movement.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</Text>
            <Text size="sm">{[movement.warehouse?.name, movement.customerWorksite?.worksite?.name].filter(Boolean).join(' · ')}</Text>
            {movement.document ? <Button component={Link} href={`/inventory/ledger/document/${movement.document.id}`} variant="subtle" size="compact-sm" mt="xs">Ver documento {movement.document.consecutive ?? ''}</Button> : null}
          </Paper>)}</Stack>
          {loading ? <Group justify="center" py="md"><Loader size="sm" /><Text size="sm">Cargando movimientos…</Text></Group> : !ledgerError && !movements.length ? <Text c="dimmed">No hay movimientos para esta selección.</Text> : null}
          {cursor ? <Button variant="light" mt="md" loading={loading} onClick={() => void loadMovements(cursor)}>Cargar más movimientos</Button> : null}
        </section>
      </Stack>
    </Modal>
  );
}
