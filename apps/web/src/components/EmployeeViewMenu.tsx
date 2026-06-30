'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Menu } from '@mantine/core';
import { IconCheck, IconChevronDown, IconLayoutGrid, IconList } from '@tabler/icons-react';

export type EmployeeViewMode = 'list' | 'cards';

const EMPLOYEE_VIEW_STORAGE_KEY = 'rev-logistica:employees:view';

const employeeViewPath: Record<EmployeeViewMode, string> = {
  list: '/employees',
  cards: '/employees/empleado-card',
};

function isEmployeeViewMode(value: string | null): value is EmployeeViewMode {
  return value === 'list' || value === 'cards';
}

export function setPreferredEmployeeView(view: EmployeeViewMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EMPLOYEE_VIEW_STORAGE_KEY, view);
}

export function usePreferredEmployeeView(currentView: EmployeeViewMode) {
  const router = useRouter();

  useEffect(() => {
    const preferredView = window.localStorage.getItem(EMPLOYEE_VIEW_STORAGE_KEY);
    if (isEmployeeViewMode(preferredView) && preferredView !== currentView) {
      router.replace(employeeViewPath[preferredView]);
      return;
    }

    if (!preferredView) {
      setPreferredEmployeeView(currentView);
    }
  }, [currentView, router]);
}

export default function EmployeeViewMenu({ currentView }: { currentView: EmployeeViewMode }) {
  const router = useRouter();

  const selectView = (view: EmployeeViewMode) => {
    setPreferredEmployeeView(view);
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
