'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconDownload, IconFile, IconPaperclip, IconTrash, IconUpload } from '@tabler/icons-react';
import { api, apiBlob, ApiError } from '@/lib/api';

export type FileEntityType = 'DOCUMENT' | 'EMPLOYEE' | 'VEHICLE' | 'CUSTOMER' | 'ASSET';

type FileCategory = {
  value: string;
  label: string;
};

type AttachedFile = {
  id: string;
  entityType: string | null;
  entityId: string | null;
  fileType: string;
  category: string | null;
  displayName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: string | null;
  createdAt: string;
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

function formatBytes(value?: number | null) {
  if (!value) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-CO');
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function fileLabel(file: AttachedFile) {
  return file.displayName?.trim() || file.originalName?.trim() || file.fileType;
}

export default function FileAttachmentsPanel({
  entityType,
  entityId,
  title = 'Documentos',
}: {
  entityType: FileEntityType;
  entityId: string;
  title?: string;
}) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [categories, setCategories] = useState<FileCategory[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryLabelByValue = useMemo(
    () => new Map(categories.map((entry) => [entry.value, entry.label])),
    [categories],
  );

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoryData, fileData] = await Promise.all([
        api<FileCategory[]>(`/files/categories/${entityType}`),
        api<AttachedFile[]>(`/files/entities/${entityType}/${entityId}`),
      ]);
      setCategories(categoryData);
      setCategory((current) => current ?? categoryData[0]?.value ?? null);
      setFiles(fileData);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudieron cargar los archivos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFiles();
  }, [entityType, entityId]);

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
      setSelectedFiles([]);
      setDisplayName('');
      setExpiresAt('');
      await loadFiles();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudo subir el archivo');
    } finally {
      setSaving(false);
    }
  };

  const download = async (file: AttachedFile) => {
    setError(null);
    try {
      const blob = await apiBlob(`/files/${file.id}/download`, { redirectOnAuthError: false });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileLabel(file);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudo descargar el archivo');
    }
  };

  const remove = async (file: AttachedFile) => {
    if (!window.confirm(`Eliminar ${fileLabel(file)}?`)) return;
    setError(null);
    try {
      await api(`/files/${file.id}`, { method: 'DELETE' });
      await loadFiles();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudo eliminar el archivo');
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <div>
          <Title order={4}>{title}</Title>
          <Text size="sm" c="dimmed">
            Sube, consulta y descarga documentos asociados a este registro.
          </Text>
        </div>
        <Badge color="blue" variant="light" leftSection={<IconPaperclip size={14} />}>
          {files.length} archivo{files.length === 1 ? '' : 's'}
        </Badge>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      <Paper
        withBorder
        radius="lg"
        p="md"
        style={{
          background: 'linear-gradient(135deg, rgba(248,250,252,0.98) 0%, rgba(239,246,255,0.72) 100%)',
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
            <div>
              <Text fw={800}>Subir documentos</Text>
              <Text size="sm" c="dimmed">
                Agrega uno o varios archivos y clasificalos antes de guardarlos.
              </Text>
            </div>
            <ThemeIcon color="blue" variant="light" size={36} radius="xl">
              <IconUpload size={18} />
            </ThemeIcon>
          </Group>

          <FileInput
            label="Archivos"
            placeholder="Arrastra o selecciona archivos"
            accept={ACCEPTED_FILE_TYPES}
            multiple
            value={selectedFiles}
            onChange={setSelectedFiles}
            leftSection={<IconPaperclip size={16} />}
            clearable
          />

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Select
              label="Categoria"
              data={categories}
              value={category}
              onChange={setCategory}
              disabled={loading || saving}
            />
            <TextInput
              label="Nombre visible (opcional)"
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
            <TextInput
              label="Vence (opcional)"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.currentTarget.value)}
            />
          </SimpleGrid>
          <Group justify="space-between" align="center" gap="sm" wrap="wrap">
            <Text size="sm" c="dimmed">
              {selectedFiles.length
                ? selectedFiles.map((file) => file.name).join(', ')
                : 'PDF, imagenes, Word, Excel, TXT o CSV. Maximo 100 MB por archivo.'}
            </Text>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={upload}
              loading={saving}
              disabled={!selectedFiles.length || !category}
            >
              Subir documento{selectedFiles.length === 1 ? '' : 's'}
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Divider />

      {files.length ? (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Archivo</Table.Th>
              <Table.Th>Categoria</Table.Th>
              <Table.Th>Vence</Table.Th>
                <Table.Th>Tamaño</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {files.map((file) => (
              <Table.Tr key={file.id}>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <IconFile size={18} />
                    <div>
                      <Text size="sm" fw={600}>
                        {fileLabel(file)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDate(file.createdAt)}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>{categoryLabelByValue.get(file.category ?? file.fileType) ?? file.category ?? file.fileType}</Table.Td>
                <Table.Td>
                  {file.expiresAt ? (
                    <Badge color={isExpired(file.expiresAt) ? 'red' : 'blue'} variant="light">
                      {formatDate(file.expiresAt)}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </Table.Td>
                <Table.Td>{formatBytes(file.sizeBytes)}</Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <ActionIcon variant="light" aria-label="Descargar archivo" onClick={() => download(file)}>
                      <IconDownload size={16} />
                    </ActionIcon>
                    <ActionIcon color="red" variant="light" aria-label="Eliminar archivo" onClick={() => remove(file)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Paper withBorder radius="lg" p="xl" bg="gray.0">
          <Stack align="center" gap="xs">
            <ThemeIcon color="gray" variant="light" size={42} radius="xl">
              <IconFile size={20} />
            </ThemeIcon>
            <Text fw={700}>{loading ? 'Cargando archivos...' : 'No hay documentos adjuntos'}</Text>
            {!loading ? (
              <Text size="sm" c="dimmed" ta="center">
                Usa el bloque de subida para asociar fotos, manuales, fichas, certificados u otros soportes.
              </Text>
            ) : null}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
