'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconPhoto, IconArrowUpRight } from '@tabler/icons-react';
import AppImage from '@/components/AppImage';

type Props = {
  name: string;
  imageUrl: string | null;
  quantity: number;
  quantityLabel: string;
  children: ReactNode;
  onOpen: () => void;
};

export default function BulkInventoryCard({ name, imageUrl, quantity, quantityLabel, children, onOpen }: Props) {
  const [brokenImage, setBrokenImage] = useState(false);
  useEffect(() => setBrokenImage(false), [imageUrl]);

  return (
    <Paper withBorder radius="lg" style={{ overflow: 'hidden', height: '100%' }}>
      <button type="button" onClick={onOpen} aria-label={`Abrir ${name}`} style={{ border: 0, padding: 0, width: '100%', cursor: 'pointer', aspectRatio: '16 / 9', background: 'var(--mantine-color-gray-0)', display: 'grid', placeItems: 'center' }}>
        {imageUrl && !brokenImage ? (
          <AppImage src={imageUrl} alt={name} width={640} height={360}
            sizes="(max-width: 48em) 100vw, (max-width: 75em) 50vw, 33vw"
            style={{ width: '100%', height: '100%', objectFit: 'contain', minHeight: 0 }} onError={() => setBrokenImage(true)} />
        ) : (
          <Stack align="center" gap={6} c="dimmed"><IconPhoto size={36} stroke={1.4} /><Text size="sm">Sin imagen</Text></Stack>
        )}
      </button>
      <Stack p="md" gap="sm">
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>{name}</Text>
        <Group justify="space-between"><Text size="sm" c="dimmed">{quantityLabel}</Text><Badge size="lg" color={quantity < 0 ? 'red' : 'teal'} variant="light">{quantity.toLocaleString('es-CO')}</Badge></Group>
        {children}
        <Button variant="light" size="sm" onClick={onOpen} rightSection={<IconArrowUpRight size={16} />}>Abrir ítem</Button>
      </Stack>
    </Paper>
  );
}
