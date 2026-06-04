'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Box, Button, Divider, Group, NavLink, Stack, Text } from '@mantine/core';
import { AppRole, clearToken, getCurrentUserRole } from '@/lib/auth';
import {
  IconArrowsShuffle,
  IconBuilding,
  IconBuildingWarehouse,
  IconChecklist,
  IconClipboardList,
  IconBox,
  IconDatabaseExport,
  IconMap2,
  IconReceipt,
  IconTruck,
  IconUsers,
  IconUser,
} from '@tabler/icons-react';

type NavLinkItem = {
  href: string;
  label: string;
  icon: typeof IconClipboardList;
  roles: AppRole[];
  activePrefixes?: string[];
};

type NavSection = {
  title: string;
  links: NavLinkItem[];
};

const sections: NavSection[] = [
  {
    title: 'Operacion',
    links: [
      { href: '/transport/solicitudes', label: 'Solicitudes', icon: IconClipboardList, roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
      { href: '/transport/cost', label: 'Transporte', icon: IconMap2, roles: ['ADMIN', 'OFFICE'] },
      { href: '/transport/vehicles', label: 'Vehiculos', icon: IconTruck, roles: ['ADMIN', 'OFFICE'] },
      { href: '/transport/obras', label: 'Obras', icon: IconBuilding, roles: ['ADMIN', 'OFFICE'] },
      { href: '/tasks', label: 'Pendientes', icon: IconChecklist, roles: ['ADMIN', 'OFFICE'] },
    ],
  },
  {
    title: 'Inventario',
    links: [
      { href: '/inventory/warehouse', label: 'Bodegas', icon: IconBuildingWarehouse, roles: ['ADMIN', 'OFFICE'] },
      { href: '/inventory/ledger', label: 'Movimientos', icon: IconArrowsShuffle, roles: ['ADMIN', 'OFFICE'] },
      {
        href: '/inventory/bulk-adjustments',
        label: 'Stock',
        icon: IconBox,
        roles: ['ADMIN', 'OFFICE'],
        activePrefixes: ['/inventory/bulk-adjustments', '/inventory/serialized-assets'],
      },
    ],
  },
  {
    title: 'Administracion',
    links: [
      { href: '/billing/prefactura', label: 'Prefactura', icon: IconReceipt, roles: ['ADMIN', 'OFFICE'] },
      { href: '/customers', label: 'Clientes', icon: IconUsers, roles: ['ADMIN', 'OFFICE'] },
      { href: '/employees', label: 'Empleados', icon: IconUser, roles: ['ADMIN', 'OFFICE'] },
      { href: '/data', label: 'Datos', icon: IconDatabaseExport, roles: ['ADMIN'] },
    ],
  },
];

type NavProps = {
  onNavigate?: () => void;
};

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentRole = getCurrentUserRole();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => (currentRole ? link.roles.includes(currentRole) : true)),
    }))
    .filter((section) => section.links.length > 0);
  const roleColor =
    currentRole === 'ADMIN' ? 'red' : currentRole === 'OFFICE' ? 'blue' : currentRole === 'DRIVER' ? 'teal' : 'gray';

  const handleLogout = () => {
    clearToken();
    onNavigate?.();
    router.replace('/login');
  };

  return (
    <Stack h="100%" gap="md" p="md">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Link href="/" style={{ display: 'block' }}>
          <img
            src="/fiesta.svg"
            alt="Rev Logistica"
            style={{ height: 36, width: 'auto', display: 'block' }}
          />
        </Link>
        <Badge color={roleColor} variant="light" radius="sm" tt="uppercase">
          {currentRole ?? 'SIN ROL'}
        </Badge>
      </Group>
      <Divider />
      <Stack gap="lg">
        {visibleSections.map((section) => (
          <Stack key={section.title} gap={6}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" lh={1.2}>
              {section.title}
            </Text>
            <Stack gap={4}>
              {section.links.map((link) => {
                const Icon = link.icon;
                const prefixes = link.activePrefixes ?? [link.href];
                const isActive = prefixes.some((prefix) => pathname?.startsWith(prefix));
                return (
                  <NavLink
                    key={link.href}
                    component={Link}
                    href={link.href}
                    label={link.label}
                    active={isActive}
                    styles={{
                      root: {
                        borderRadius: 'var(--mantine-radius-md)',
                        borderLeft: isActive
                          ? '3px solid var(--mantine-color-blue-6)'
                          : '3px solid transparent',
                        backgroundColor: isActive ? 'var(--mantine-color-blue-0)' : 'transparent',
                        paddingLeft: 'calc(var(--mantine-spacing-sm) - 3px)',
                        paddingTop: '10px',
                        paddingBottom: '10px',
                      },
                      body: {
                        minHeight: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                      },
                      label: {
                        color: isActive ? 'var(--mantine-color-blue-9)' : 'var(--mantine-color-gray-8)',
                        fontWeight: isActive ? 700 : 500,
                        lineHeight: 1.2,
                      },
                      section: {
                        color: isActive ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-gray-6)',
                        display: 'flex',
                        alignItems: 'center',
                      },
                    }}
                    leftSection={<Icon size={17} stroke={1.8} />}
                    onClick={onNavigate}
                  />
                );
              })}
            </Stack>
          </Stack>
        ))}
      </Stack>
      <Box mt="auto">
        <Divider mb="md" />
        <Stack gap="xs">
          <Button variant="subtle" color="red" onClick={handleLogout} size="xs">
            Logout
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
