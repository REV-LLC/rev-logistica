'use client';

import { useRef } from 'react';
import { Alert, Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCamera, IconTrash } from '@tabler/icons-react';
import type { ImageFileDraft } from '@/components/transport/file-drafts';

type EvidencePhotosPanelProps = {
  photos: ImageFileDraft[];
  error: string | null;
  onAdd: (files: FileList | null) => void;
  onRemove: (photoId: string) => void;
  onClear: () => void;
};

export default function EvidencePhotosPanel({
  photos,
  error,
  onAdd,
  onRemove,
  onClear,
}: EvidencePhotosPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Paper withBorder radius="lg" p="md" mt="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center" className="mobile-stack">
          <div>
            <Text fw={700}>Evidencias fotográficas</Text>
            <Text size="sm" c="dimmed">
              Toma fotos desde la tablet o adjunta imágenes antes de enviar.
            </Text>
          </div>
          <Group gap="xs">
            <Button
              type="button"
              variant="light"
              leftSection={<IconCamera size={16} />}
              onClick={() => inputRef.current?.click()}
            >
              Tomar / adjuntar
            </Button>
            {photos.length ? (
              <Button type="button" variant="subtle" color="red" onClick={onClear}>
                Limpiar
              </Button>
            ) : null}
          </Group>
        </Group>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          multiple
          onChange={(event) => {
            onAdd(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
          style={{ display: 'none' }}
        />
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        {photos.length ? (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
            {photos.map((photo) => (
              <Paper key={photo.id} withBorder radius="md" p={6}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={photo.previewUrl}
                    alt="Vista previa de evidencia"
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 6,
                      display: 'block',
                    }}
                  />
                  <Button
                    type="button"
                    size="xs"
                    color="red"
                    variant="filled"
                    leftSection={<IconTrash size={12} />}
                    onClick={() => onRemove(photo.id)}
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >
                    Quitar
                  </Button>
                </div>
                <Text size="xs" c="dimmed" mt={4} truncate>
                  {photo.file.name}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">Sin fotos adjuntas.</Text>
        )}
      </Stack>
    </Paper>
  );
}
