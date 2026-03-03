'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Box, Button, Divider, Group, NavLink, Stack } from '@mantine/core';
import { AppRole, clearToken, getCurrentUserRole, getToken } from '@/lib/auth';
import {
  IconArrowsShuffle,
  IconBuilding,
  IconBuildingWarehouse,
  IconChecklist,
  IconClipboardList,
  IconPlus,
  IconBox,
  IconTruck,
  IconUsers,
  IconUser,
} from '@tabler/icons-react';

type NavLinkItem = {
  href: string;
  label: string;
  icon: typeof IconClipboardList;
  roles: AppRole[];
};

const links: NavLinkItem[] = [
  { href: '/transport/solicitudes', label: 'Solicitudes iPad', icon: IconClipboardList, roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
  { href: '/tasks', label: 'Pendientes', icon: IconChecklist, roles: ['ADMIN', 'OFFICE'] },
  { href: '/inventory/warehouse', label: 'Bodegas', icon: IconBuildingWarehouse, roles: ['ADMIN', 'OFFICE'] },
  { href: '/inventory/ledger', label: 'Movimientos', icon: IconArrowsShuffle, roles: ['ADMIN', 'OFFICE'] },
  { href: '/inventory/serialized-assets', label: 'Crear equipo', icon: IconPlus, roles: ['ADMIN', 'OFFICE'] },
  { href: '/inventory/bulk-adjustments', label: 'Agregar stock', icon: IconBox, roles: ['ADMIN', 'OFFICE'] },
  { href: '/transport/cost', label: 'Transporte', icon: IconTruck, roles: ['ADMIN', 'OFFICE'] },
  { href: '/transport/vehicles', label: 'Vehículos', icon: IconTruck, roles: ['ADMIN', 'OFFICE'] },
  { href: '/transport/obras', label: 'Obras', icon: IconBuilding, roles: ['ADMIN', 'OFFICE'] },
  { href: '/customers', label: 'Clientes', icon: IconUsers, roles: ['ADMIN', 'OFFICE'] },
  { href: '/employees', label: 'Empleados', icon: IconUser, roles: ['ADMIN', 'OFFICE'] }
];

type NavProps = {
  onNavigate?: () => void;
};

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const currentRole = getCurrentUserRole();
  const allowedLinks = links.filter((link) => (currentRole ? link.roles.includes(currentRole) : true));
  const roleColor =
    currentRole === 'ADMIN' ? 'red' : currentRole === 'OFFICE' ? 'blue' : currentRole === 'DRIVER' ? 'teal' : 'gray';

  const handleLogout = () => {
    clearToken();
    onNavigate?.();
    router.replace('/login');
  };

  const handleCopyToken = async () => {
    const token = getToken();
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
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
        <Badge color={roleColor} variant="light">
          {currentRole ?? 'SIN ROL'}
        </Badge>
      </Group>
      <Divider />
      <Stack gap={2}>
        {allowedLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname?.startsWith(link.href) ?? false;
          return (
            <NavLink
              key={link.href}
              component={Link}
              href={link.href}
              label={link.label}
              active={isActive}
              color={isActive ? 'green' : undefined}
              styles={{
                root: {
                  backgroundColor: isActive ? 'var(--mantine-color-green-0)' : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                },
                label: {
                  color: isActive ? 'var(--mantine-color-green-8)' : undefined,
                  fontWeight: isActive ? 700 : 500,
                },
                section: { color: isActive ? 'var(--mantine-color-green-7)' : undefined },
              }}
              leftSection={<Icon size={16} />}
              onClick={onNavigate}
            />
          );
        })}
      </Stack>
      <Box mt="auto">
        <Divider mb="md" />
        <Stack gap="xs">
          <Button variant="light" onClick={handleCopyToken} size="xs">
            {copied ? 'Copiado' : 'Copiar token'}
          </Button>
          <Button variant="light" color="red" onClick={handleLogout} size="xs">
            Logout
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
