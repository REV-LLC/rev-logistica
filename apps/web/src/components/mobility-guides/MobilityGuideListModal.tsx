'use client';

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { IconDownload, IconEye, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, apiBlob, ApiError } from '@/lib/api';
import MobilityGuideStatus from './MobilityGuideStatus';

export type MobilityGuide = {
  id: string;
  name: string;
  issuedAt: string;
  expiresAt: string;
  fileObject: { id: string; mimeType?: string | null; sizeBytes?: number | null; originalName?: string | null };
};

type AssetSummary = {
  assetId: string;
  skuName?: string | null;
  serialOrEngine?: string | null;
  registrationNumber?: string | null;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));

export default function MobilityGuideListModal({
  asset,
  canManage,
  opened,
  onClose,
  onChanged,
}: {
  asset: AssetSummary | null;
  canManage: boolean;
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [guides, setGuides] = useState<MobilityGuide[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  useEffect(() => {
    if (!opened || !asset) return;
    setLoading(true);
    setError(null);
    api<MobilityGuide[]>(`/mobility-guides/assets/${asset.assetId}`)
      .then(setGuides)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las guias'))
      .finally(() => setLoading(false));
  }, [asset, opened]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const loadBlob = async (guide: MobilityGuide) => {
    setBusyId(guide.id);
    setError(null);
    try {
      return await apiBlob(`/files/${guide.fileObject.id}/download`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir el archivo');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const preview = async (guide: MobilityGuide) => {
    const blob = await loadBlob(guide);
    if (!blob) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewName(guide.name);
    setPreviewUrl(URL.createObjectURL(blob));
  };

  const download = async (guide: MobilityGuide) => {
    const blob = await loadBlob(guide);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = guide.fileObject.originalName || `${guide.name}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (guide: MobilityGuide) => {
    if (!window.confirm(`¿Eliminar la guia "${guide.name}"?`)) return;
    setBusyId(guide.id);
    setError(null);
    try {
      await api(`/mobility-guides/${guide.id}`, { method: 'DELETE' });
      setGuides((items) => items.filter((item) => item.id !== guide.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la guia');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Modal opened={opened} onClose={onClose} title="Guias de movilidad" size="lg" centered>
        <Stack>
          {asset ? (
            <div>
              <Text fw={700}>{asset.skuName ?? asset.serialOrEngine ?? 'Activo'}</Text>
              <Text size="sm" c="dimmed">Registro: {asset.registrationNumber}</Text>
            </div>
          ) : null}
          {error ? <Alert color="red">{error}</Alert> : null}
          {loading ? <Loader size="sm" /> : null}
          {!loading && guides.length === 0 ? (
            <Paper withBorder p="lg" radius="md">
              <Text c="dimmed" ta="center">Este activo aun no tiene guias publicadas.</Text>
            </Paper>
          ) : null}
          {guides.map((guide) => (
            <Paper key={guide.id} withBorder p="md" radius="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={3}>
                  <Group gap="xs">
                    <Text fw={650}>{guide.name}</Text>
                    <MobilityGuideStatus expiresAt={guide.expiresAt} />
                  </Group>
                  <Text size="xs" c="dimmed">
                    Expedicion: {formatDate(guide.issuedAt)} · Expiracion: {formatDate(guide.expiresAt)}
                  </Text>
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon aria-label="Visualizar guia" variant="light" loading={busyId === guide.id} onClick={() => preview(guide)}>
                    <IconEye size={17} />
                  </ActionIcon>
                  <ActionIcon aria-label="Descargar guia" variant="light" onClick={() => download(guide)}>
                    <IconDownload size={17} />
                  </ActionIcon>
                  {canManage ? (
                    <ActionIcon aria-label="Eliminar guia" color="red" variant="light" onClick={() => remove(guide)}>
                      <IconTrash size={17} />
                    </ActionIcon>
                  ) : null}
                </Group>
              </Group>
            </Paper>
          ))}
          <Button variant="default" onClick={onClose}>Cerrar</Button>
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(previewUrl)}
        onClose={() => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }}
        title={previewName}
        size="90%"
        centered
      >
        {previewUrl ? <iframe src={previewUrl} title={previewName} style={{ width: '100%', height: '75vh', border: 0 }} /> : null}
      </Modal>
    </>
  );
}
