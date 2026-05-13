'use client';

import type { ReactNode } from 'react';
import { Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  color: string;
  icon: ReactNode;
};

export default function StatCard({ label, value, hint, color, icon }: StatCardProps) {
  return (
    <Paper
      withBorder
      radius="lg"
      p="lg"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,248,251,0.92) 100%)',
        borderColor: 'rgba(15, 23, 42, 0.08)',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
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
        <ThemeIcon color={color} variant="light" radius="xl" size={42}>
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
