'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconDownload, IconEye, IconFile, IconPaperclip, IconTrash, IconUpload } from '@tabler/icons-react';
import { api, apiBlob, ApiError } from '@/lib/api';
import FileUploadModal, {
  type FileCategoryOption,
  type FileEntityType,
} from '@/components/FileUploadModal';
import TableRowActions from '@/components/TableRowActions';

export type { FileEntityType } from '@/components/FileUploadModal';

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

function canPreview(file: AttachedFile) {
  if (file.mimeType === 'application/pdf' || file.mimeType?.startsWith('image/')) return true;
  return file.originalName?.toLowerCase().endsWith('.pdf') ?? false;
}

type FileActionsProps = {
  file: AttachedFile;
  previewLoadingId: string | null;
  onPreview: (file: AttachedFile) => void;
  onDownload: (file: AttachedFile) => void;
  onRemove: (file: AttachedFile) => void;
};

function FileActions({
  file,
  previewLoadingId,
  onPreview,
  onDownload,
  onRemove,
}: FileActionsProps) {
  return (
    <TableRowActions
      actions={[
        ...(canPreview(file)
          ? [{
              key: 'view',
              label: `Ver ${fileLabel(file)}`,
              icon: <IconEye size={16} />,
              color: 'blue',
              loading: previewLoadingId === file.id,
              onClick: () => onPreview(file),
            }]
          : []),
        {
          key: 'download',
          label: `Descargar ${fileLabel(file)}`,
          icon: <IconDownload size={16} />,
          color: 'violet',
          onClick: () => onDownload(file),
        },
        {
          key: 'delete',
          label: `Eliminar ${fileLabel(file)}`,
          icon: <IconTrash size={16} />,
          color: 'red',
          onClick: () => onRemove(file),
        },
      ]}
    />
  );
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
  const [categories, setCategories] = useState<FileCategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpened, setUploadOpened] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: AttachedFile; url: string } | null>(null);

  useEffect(() => {
    const previewUrl = preview?.url;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [preview?.url]);

  const categoryLabelByValue = useMemo(
    () => new Map(categories.map((entry) => [entry.value, entry.label])),
    [categories],
  );

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoryData, fileData] = await Promise.all([
        api<FileCategoryOption[]>(`/files/categories/${entityType}`),
        api<AttachedFile[]>(`/files/entities/${entityType}/${entityId}`),
      ]);
      setCategories(categoryData);
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

  const openPreview = async (file: AttachedFile) => {
    setPreviewLoadingId(file.id);
    setError(null);
    try {
      const blob = await apiBlob(`/files/${file.id}/download`, { redirectOnAuthError: false });
      setPreview({ file, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudo visualizar el archivo');
    } finally {
      setPreviewLoadingId(null);
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
        <Group gap="xs" wrap="wrap">
          <Badge color="blue" variant="light" leftSection={<IconPaperclip size={14} />}>
            {files.length} archivo{files.length === 1 ? '' : 's'}
          </Badge>
          <Button
            size="xs"
            leftSection={<IconUpload size={15} />}
            onClick={() => setUploadOpened(true)}
            disabled={loading || !categories.length}
          >
            Subir archivo
          </Button>
        </Group>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      <Divider />

      {files.length ? (
        <>
          <Table striped highlightOnHover visibleFrom="sm" style={{ tableLayout: 'fixed', width: '100%' }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="34%">Archivo</Table.Th>
                <Table.Th w="20%">Categoria</Table.Th>
                <Table.Th w="16%">Vence</Table.Th>
                <Table.Th w="12%">Tamaño</Table.Th>
                <Table.Th w={120} ta="right">Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {files.map((file) => (
                <Table.Tr key={file.id}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <IconFile size={18} style={{ flex: '0 0 auto' }} />
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>
                          {fileLabel(file)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDate(file.createdAt)}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ overflowWrap: 'anywhere' }}>
                    {categoryLabelByValue.get(file.category ?? file.fileType) ?? file.category ?? file.fileType}
                  </Table.Td>
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
                    <FileActions
                      file={file}
                      previewLoadingId={previewLoadingId}
                      onPreview={openPreview}
                      onDownload={download}
                      onRemove={remove}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Stack hiddenFrom="sm" gap="xs">
            {files.map((file) => (
              <Paper key={file.id} withBorder radius="md" p="sm">
                <Stack gap="xs">
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <IconFile size={18} style={{ flex: '0 0 auto', marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" fw={700} style={{ overflowWrap: 'anywhere' }}>
                        {fileLabel(file)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDate(file.createdAt)} · {formatBytes(file.sizeBytes)}
                      </Text>
                    </div>
                  </Group>

                  <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {categoryLabelByValue.get(file.category ?? file.fileType) ?? file.category ?? file.fileType}
                      {file.expiresAt ? ` · Vence ${formatDate(file.expiresAt)}` : ''}
                    </Text>
                    <FileActions
                      file={file}
                      previewLoadingId={previewLoadingId}
                      onPreview={openPreview}
                      onDownload={download}
                      onRemove={remove}
                    />
                  </Group>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
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

      <Modal
        opened={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? fileLabel(preview.file) : 'Vista previa'}
        size="90%"
        centered
      >
        {preview?.file.mimeType?.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt={fileLabel(preview.file)}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', margin: '0 auto', objectFit: 'contain' }}
          />
        ) : preview ? (
          <iframe
            src={preview.url}
            title={`Vista previa de ${fileLabel(preview.file)}`}
            style={{ display: 'block', width: '100%', height: '75vh', border: 0 }}
          />
        ) : null}
      </Modal>

      <FileUploadModal
        opened={uploadOpened}
        entityType={entityType}
        entityId={entityId}
        categories={categories}
        onClose={() => setUploadOpened(false)}
        onUploaded={loadFiles}
      />
    </Stack>
  );
}
