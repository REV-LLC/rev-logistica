'use client';

import {
  Alert,
  Button,
  FileInput,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFileTypePdf, IconUpload } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type AssetOption = {
  assetId: string;
  skuName?: string | null;
  serialOrEngine?: string | null;
  registrationNumber: string;
};

const localDate = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const addMonth = (value: string) => {
  const source = new Date(`${value}T12:00:00`);
  const day = source.getDate();
  source.setDate(1);
  source.setMonth(source.getMonth() + 1);
  const lastDay = new Date(source.getFullYear(), source.getMonth() + 1, 0).getDate();
  source.setDate(Math.min(day, lastDay));
  return localDate(source);
};

export default function PublishMobilityGuideModal({
  assets,
  initialAssetId,
  opened,
  onClose,
  onPublished,
}: {
  assets: AssetOption[];
  initialAssetId?: string | null;
  opened: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const today = useMemo(() => localDate(new Date()), []);
  const [name, setName] = useState('');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState(today);
  const [expiresAt, setExpiresAt] = useState(addMonth(today));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) setAssetId(initialAssetId ?? null);
  }, [initialAssetId, opened]);

  const resetAndClose = () => {
    setName('');
    setAssetId(null);
    setIssuedAt(today);
    setExpiresAt(addMonth(today));
    setFile(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!name.trim() || !assetId || !issuedAt || !expiresAt || !file) {
      setError('Completa todos los campos y adjunta el PDF.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setError('La guia debe ser un archivo PDF.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('El PDF no puede superar 100 MB.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('name', name.trim());
      body.append('assetId', assetId);
      body.append('issuedAt', issuedAt);
      body.append('expiresAt', expiresAt);
      body.append('file', file);
      await api('/mobility-guides', { method: 'POST', body });
      onPublished();
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo publicar la guia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={resetAndClose} title="Publicar guia de movilidad" size="lg" centered>
      <Stack>
        <Text size="sm" c="dimmed">
          La guia quedara asociada al activo y disponible para conductores. Vigencia maxima: un mes.
        </Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput label="Nombre de la guia" placeholder="Ej. Guia movilidad julio 2026" value={name} onChange={(event) => setName(event.currentTarget.value)} required />
        <Select
          searchable
          label="Maquina / activo"
          placeholder="Selecciona el activo"
          value={assetId}
          onChange={setAssetId}
          data={assets.map((asset) => ({
            value: asset.assetId,
            label: `${asset.skuName ?? asset.serialOrEngine ?? 'Activo'} · Registro ${asset.registrationNumber}`,
          }))}
          required
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            type="date"
            label="Fecha de expedicion"
            value={issuedAt}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setIssuedAt(value);
              if (value) setExpiresAt(addMonth(value));
            }}
            required
          />
          <TextInput type="date" label="Fecha de expiracion" value={expiresAt} onChange={(event) => setExpiresAt(event.currentTarget.value)} min={issuedAt} required />
        </SimpleGrid>
        <FileInput
          label="Documento PDF"
          description="Maximo 100 MB"
          accept="application/pdf"
          value={file}
          onChange={setFile}
          leftSection={<IconFileTypePdf size={17} />}
          placeholder="Selecciona la guia descargada"
          clearable
          required
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={resetAndClose}>Cancelar</Button>
          <Button leftSection={<IconUpload size={17} />} loading={saving} onClick={submit}>Publicar guia</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
