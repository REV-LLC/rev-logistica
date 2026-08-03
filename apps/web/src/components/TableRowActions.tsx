'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ActionIcon, Group, Tooltip } from '@mantine/core';

export type TableRowAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
};

export default function TableRowActions({ actions }: { actions: TableRowAction[] }) {
  return (
    <Group gap={6} justify="flex-end" wrap="nowrap">
      {actions.map((action) => {
        const commonProps = {
          'aria-label': action.label,
          color: action.color ?? 'gray',
          disabled: action.disabled,
          loading: action.loading,
          size: 'sm' as const,
          variant: 'light' as const,
        };

        return (
          <Tooltip key={action.key} label={action.label} withArrow>
            {action.href ? (
              <ActionIcon component={Link} href={action.href} {...commonProps}>
                {action.icon}
              </ActionIcon>
            ) : (
              <ActionIcon {...commonProps} onClick={action.onClick}>
                {action.icon}
              </ActionIcon>
            )}
          </Tooltip>
        );
      })}
    </Group>
  );
}
