'use client';

import type { ReactNode } from 'react';
import { Group, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';

type PageHeaderCardProps = {
  title: string;
  description: ReactNode;
  icon: ReactNode;
  iconColor: string;
  accentColor: string;
  aside?: ReactNode;
  children?: ReactNode;
};

export default function PageHeaderCard({
  title,
  description,
  icon,
  iconColor,
  accentColor,
  aside,
  children,
}: PageHeaderCardProps) {
  return (
    <Paper
      withBorder
      radius="xl"
      p={{ base: 'lg', md: 'xl' }}
      style={{
        background: `radial-gradient(circle at top left, ${accentColor}, transparent 28%), linear-gradient(135deg, #ffffff 0%, #f4f7fb 100%)`,
        borderColor: 'rgba(15, 23, 42, 0.08)',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color={iconColor} variant="light" size={38} radius="xl">
            {icon}
          </ThemeIcon>
          <div>
            <Title order={2}>{title}</Title>
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          </div>
        </Group>
        {aside}
      </Group>

      {children ? <Stack gap="lg" mt="lg">{children}</Stack> : null}
    </Paper>
  );
}
