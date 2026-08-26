'use client';

import { Button, Group, Stack, Text } from '@mantine/core';

type RequestSignaturePanelProps = {
  label: string;
  signature: string | null;
  editing: boolean;
  signatureLocked: boolean;
  onRemove: () => void;
  onOpenCapture: () => void;
};

export default function RequestSignaturePanel({
  label,
  signature,
  editing,
  signatureLocked,
  onRemove,
  onOpenCapture,
}: RequestSignaturePanelProps) {
  return (
    <Stack gap="xs">
      <Text fw={600}>{label}</Text>
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">{signature ? 'Firma capturada' : 'Sin firma'}</Text>
        {signatureLocked ? (
          <Text size="xs" c="dimmed">Firma bloqueada durante la edición</Text>
        ) : (
          <Group gap="xs">
            {editing && signature ? (
              <Button type="button" variant="subtle" color="red" onClick={onRemove}>
                Eliminar firma
              </Button>
            ) : null}
            <Button type="button" variant="light" onClick={onOpenCapture}>
              {signature ? 'Cambiar firma' : 'Firmar'}
            </Button>
          </Group>
        )}
      </Group>
      {signature ? (
        <img
          src={signature}
          alt={label}
          style={{
            width: '100%',
            maxWidth: 420,
            height: 110,
            objectFit: 'contain',
            border: '1px solid var(--mantine-color-gray-4)',
            borderRadius: 8,
            background: '#fff',
          }}
        />
      ) : null}
    </Stack>
  );
}
