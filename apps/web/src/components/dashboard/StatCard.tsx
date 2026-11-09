'use client';

import type { ReactNode } from 'react';
import { Box, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  color: string;
  icon: ReactNode;
  variant?: 'default' | 'glass';
};

export default function StatCard({ label, value, hint, color, icon, variant = 'default' }: StatCardProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return null;
  }

  const content = (
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            {label}
          </Text>
          <Text size="2rem" fw={700} lh={1}>
            {value}
          </Text>
          {hint ? (
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
          ) : null}
        </Stack>
        <ThemeIcon color={color} variant="light" radius="xl" size={42} style={{ flexShrink: 0 }}>
          {icon}
        </ThemeIcon>
      </Group>
  );

  if (variant === 'glass') {
    return <Box data-stat-variant="glass">{content}</Box>;
  }

  return (
    <Paper
      withBorder
      radius="lg"
      p="lg"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,248,251,0.92) 100%)',
        borderColor: 'rgba(15, 23, 42, 0.08)',
      }}
    >
      {content}
    </Paper>
  );
}
