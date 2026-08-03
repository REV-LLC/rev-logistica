'use client';

import { useEffect, useState } from 'react';
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
import { IconPaperclip, IconUpload } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';

export type FileEntityType = 'DOCUMENT' | 'EMPLOYEE' | 'VEHICLE' | 'CUSTOMER' | 'ASSET';

export type FileCategoryOption = {
  value: string;
  label: string;
};

type FileUploadModalProps = {
  opened: boolean;
  entityType: FileEntityType;
  entityId: string;
  categories: FileCategoryOption[];
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
};

const ACCEPTED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
].join(',');

export default function FileUploadModal({
  opened,
  entityType,
  entityId,
  categories,
  onClose,
  onUploaded,
}: FileUploadModalProps) {
  const [category, setCategory] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setCategory((current) => current ?? categories[0]?.value ?? null);
  }, [categories, opened]);

  const reset = () => {
    setCategory(categories[0]?.value ?? null);
    setDisplayName('');
    setExpiresAt('');
    setSelectedFiles([]);
    setError(null);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const upload = async () => {
    if (!selectedFiles.length || !category) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      formData.append('category', category);
      if (displayName.trim()) formData.append('displayName', displayName.trim());
      if (expiresAt) formData.append('expiresAt', expiresAt);

      await api(`/files/entities/${entityType}/${entityId}`, {
        method: 'POST',
        body: formData,
      });
      await onUploaded();
      reset();
      onClose();
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiError
          ? `${uploadError.status}: ${uploadError.message}`
          : 'No se pudo subir el archivo',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Subir documentos"
      size="lg"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Elige los archivos y completa la información con la que aparecerán en el registro.
        </Text>

        {error ? <Alert color="red">{error}</Alert> : null}

        <FileInput
          label="Archivos"
          placeholder="Selecciona uno o varios archivos"
          description="PDF, imágenes, Word, Excel, TXT o CSV. Máximo 100 MB por archivo."
          accept={ACCEPTED_FILE_TYPES}
          multiple
          value={selectedFiles}
          onChange={setSelectedFiles}
          leftSection={<IconPaperclip size={16} />}
          clearable
          required
        />

        <TextInput
          label="Nombre visible"
          description="Opcional. Si lo dejas vacío se usará el nombre original del archivo."
          placeholder="Ej. Manual de operación"
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Categoría"
            data={categories}
            value={category}
            onChange={setCategory}
            disabled={saving}
            required
          />
          <TextInput
            label="Fecha de vencimiento (opcional)"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
        </SimpleGrid>

        {selectedFiles.length ? (
          <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {selectedFiles.map((file) => file.name).join(', ')}
          </Text>
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button
            leftSection={<IconUpload size={16} />}
            onClick={upload}
            loading={saving}
            disabled={!selectedFiles.length || !category}
          >
            Subir archivo{selectedFiles.length === 1 ? '' : 's'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
