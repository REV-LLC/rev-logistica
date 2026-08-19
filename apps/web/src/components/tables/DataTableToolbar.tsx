import type { CSSProperties, ReactNode } from 'react';
import { Group, Stack, Text } from '@mantine/core';

type DataTableToolbarProps = {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  controlsStyle?: CSSProperties;
  mb?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
};

export default function DataTableToolbar({
  title,
  description,
  children,
  controlsStyle,
  mb = 'md',
}: DataTableToolbarProps) {
  return (
    <Group justify="space-between" align="flex-end" mb={mb} gap="md" wrap="wrap">
      {title || description ? (
        <Stack gap={2}>
          {title ? <Text fw={800}>{title}</Text> : null}
          {description ? <Text size="sm" c="dimmed">{description}</Text> : null}
        </Stack>
      ) : null}
      {children ? (
        <Group gap="sm" w={{ base: '100%', md: 'auto' }} wrap="wrap" style={controlsStyle}>
          {children}
        </Group>
      ) : null}
    </Group>
  );
}
