'use client';

import { Box, Group, Paper, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import styles from './CollectionLoading.module.css';
import type { SimpleGridProps } from '@mantine/core';

/** Reserves the final layout while the collection request is pending. */
export default function CollectionLoading({ label = 'Cargando contenido', variant = 'equipment', cols = { base: 1, sm: 2, lg: 3 }, count = 6 }: {
  label?: string;
  variant?: 'equipment' | 'employees' | 'rows';
  cols?: SimpleGridProps['cols'];
  count?: number;
}) {
  const placeholders = Array.from({ length: count }, (_, index) => (
    <Paper key={index} withBorder radius="lg" p="md" aria-hidden="true">
      {variant === 'rows' ? <Group wrap="nowrap">
        <Skeleton height={44} width={44} radius="md" style={{ flexShrink: 0 }} />
        <Stack gap={8} style={{ flex: 1 }}><Skeleton height={14} width="55%" /><Skeleton height={10} width="35%" /></Stack>
        <Skeleton height={30} width={60} radius="md" />
      </Group> : <Stack gap="md">
        {variant === 'employees' ? <Group wrap="nowrap"><Skeleton height={64} width={64} circle style={{ flexShrink: 0 }} /><Stack gap={8} style={{ flex: 1 }}><Skeleton height={16} width="85%" /><Skeleton height={11} width="60%" /></Stack></Group> : <Skeleton height={180} radius="md" />}
        <Skeleton height={16} width="75%" />
        <Skeleton height={12} width="55%" />
        <Group gap="xs"><Skeleton height={22} width={75} radius="xl" /><Skeleton height={22} width={90} radius="xl" /></Group>
        <Group justify="space-between" mt="xs"><Skeleton height={30} width={80} radius="md" /><Skeleton height={30} width={variant === 'employees' ? 120 : 65} radius="md" /></Group>
      </Stack>}
    </Paper>
  ));
  return <Box data-page-loading="true" className={styles.root} role="status" aria-label={label} aria-live="polite" aria-busy="true">
    <Text size="sm" c="dimmed" mb="sm">{label}…</Text>
    {variant === 'rows' ? <Stack gap="sm">{placeholders}</Stack> : <SimpleGrid cols={cols} spacing="md">{placeholders}</SimpleGrid>}
  </Box>;
}
