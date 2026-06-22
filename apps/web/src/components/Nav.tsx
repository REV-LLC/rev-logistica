'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Box, Button, Divider, Group, NavLink, Stack, Text } from '@mantine/core';
import { AppRole, clearToken, getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';
import {
  IconArrowsShuffle,
  IconBuilding,
  IconBuildingWarehouse,
  IconChecklist,
  IconClipboardList,
  IconBox,
  IconDatabaseExport,
  IconRulerMeasure,
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
      { href: '/transport/requests', label: 'Solicitudes', icon: IconClipboardList, roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
      { href: '/transport/cost', label: 'Transport', icon: IconMap2, roles: ['ADMIN', 'OFFICE'] },
      { href: '/transport/vehicles', label: 'Vehiculos', icon: IconTruck, roles: ['ADMIN', 'OFFICE'] },
      { href: '/transport/worksites', label: 'Obras', icon: IconBuilding, roles: ['ADMIN', 'OFFICE'] },
      { href: '/tasks', label: 'Pendientes', icon: IconChecklist, roles: ['ADMIN', 'OFFICE'] },
    ],
  },
  {
    title: 'Inventario',
    links: [
      { href: '/inventory/warehouse', label: 'Bodegas', icon: IconBuildingWarehouse, roles: ['ADMIN', 'OFFICE'] },
      { href: '/inventory/ledger', label: 'Movimientos', icon: IconArrowsShuffle, roles: ['ADMIN', 'OFFICE'] },
      { href: '/inventory/scaffold-modulations', label: 'Modulaciones', icon: IconRulerMeasure, roles: ['ADMIN', 'OFFICE'] },
      {
        href: '/inventory/bulk-adjustments',
        label: 'Agregar inventario',
        icon: IconBox,
        roles: ['ADMIN', 'OFFICE'],
        activePrefixes: ['/inventory/bulk-adjustments', '/inventory/serialized-assets'],
      },
    ],
  },
  {
    title: 'Administracion',
    links: [
      { href: '/billing/pre-invoice', label: 'Prefactura', icon: IconReceipt, roles: ['ADMIN', 'OFFICE'] },
      { href: '/customers', label: 'Clientes', icon: IconUsers, roles: ['ADMIN', 'OFFICE'] },
      { href: '/employees', label: 'Empleados', icon: IconUser, roles: ['ADMIN', 'OFFICE'] },
      { href: '/data', label: 'Datos', icon: IconDatabaseExport, roles: ['ADMIN'] },
    ],
  },
];

const isTransportCostEnabled = process.env.NODE_ENV !== 'production';

type NavProps = {
  onNavigate?: () => void;
};

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentRole = getCurrentUserRole();
  const currentSession = getCurrentUserSession();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => {
        if (link.href === '/transport/cost' && !isTransportCostEnabled) {
          return false;
        }

        return currentRole ? link.roles.includes(currentRole) : true;
      }),
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
    <Stack h="100%" gap="lg" p="lg">
      <Group justify="space-between" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
        <Link href="/" style={{ display: 'block', flexShrink: 0 }}>
          <img
            src="/fiesta.svg"
            alt="Rev Logistica"
            style={{ height: 52, width: 'auto', display: 'block' }}
          />
        </Link>
        <Stack gap={2} align="flex-end" style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          <Badge
            color={roleColor}
            variant="light"
            radius="sm"
            tt="uppercase"
            size="lg"
            style={{ flexShrink: 0, maxWidth: '100%' }}
          >
            {currentRole ?? 'SIN ROL'}
          </Badge>
          {currentSession?.email ? (
            <Text
              size="xs"
              c="dimmed"
              ta="right"
              lh={1.2}
              title={currentSession.email}
              w="100%"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentSession.email}
            </Text>
          ) : null}
        </Stack>
      </Group>
      <Divider />
      <Stack gap="lg">
        {visibleSections.map((section) => (
          <Stack key={section.title} gap="xs">
            <Text size="sm" fw={700} c="dimmed" tt="uppercase" px="sm" lh={1.2}>
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
                          ? '3px solid #d99a18'
                          : '3px solid transparent',
                        backgroundColor: isActive ? '#fff4d6' : 'transparent',
                        paddingLeft: 'calc(var(--mantine-spacing-sm) - 3px)',
                        paddingTop: '12px',
                        paddingBottom: '12px',
                      },
                      body: {
                        minHeight: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                      },
                      label: {
                        color: isActive ? '#8a5a00' : 'var(--mantine-color-gray-8)',
                        fontWeight: isActive ? 700 : 500,
                        lineHeight: 1.2,
                        fontSize: '0.92rem',
                      },
                      section: {
                        color: isActive ? '#b87500' : 'var(--mantine-color-gray-6)',
                        display: 'flex',
                        alignItems: 'center',
                      },
                    }}
                    leftSection={<Icon size={20} stroke={1.8} />}
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
          <Button variant="subtle" color="red" onClick={handleLogout} size="sm">
            Cerrar sesion
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
