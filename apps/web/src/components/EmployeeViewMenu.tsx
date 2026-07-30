'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Menu } from '@mantine/core';
import { IconCheck, IconChevronDown, IconLayoutGrid, IconList } from '@tabler/icons-react';

export type EmployeeViewMode = 'list' | 'cards';

const employeeViewPath: Record<EmployeeViewMode, string> = {
  list: '/employees?view=list',
  cards: '/employees/empleado-card',
};

export function usePreferredEmployeeView(currentView: EmployeeViewMode) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (currentView === 'list' && searchParams.get('view') !== 'list') {
      router.replace(employeeViewPath.cards);
    }
  }, [currentView, router, searchParams]);
}

export default function EmployeeViewMenu({ currentView }: { currentView: EmployeeViewMode }) {
  const router = useRouter();

  const selectView = (view: EmployeeViewMode) => {
    if (view !== currentView) {
      router.push(employeeViewPath[view]);
    }
  };

  return (
    <Menu position="bottom-end" shadow="md" width={180}>
      <Menu.Target>
        <Button variant="light" rightSection={<IconChevronDown size={14} />}>
          Vista
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconList size={16} />}
          rightSection={currentView === 'list' ? <IconCheck size={14} /> : undefined}
          onClick={() => selectView('list')}
        >
          Lista
        </Menu.Item>
        <Menu.Item
          leftSection={<IconLayoutGrid size={16} />}
          rightSection={currentView === 'cards' ? <IconCheck size={14} /> : undefined}
          onClick={() => selectView('cards')}
        >
          Cards
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
