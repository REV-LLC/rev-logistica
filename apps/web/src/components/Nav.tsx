'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, Button, Divider, NavLink, Stack } from '@mantine/core';
import { clearToken, getToken } from '@/lib/auth';
import {
  IconArrowsShuffle,
  IconBuilding,
  IconBuildingWarehouse,
  IconChecklist,
  IconFileInvoice,
  IconMapPin,
  IconTool,
  IconTruck,
  IconUsers,
  IconUser,
} from '@tabler/icons-react';

const links = [
  { href: '/tasks', label: 'Pendientes', icon: IconChecklist },
  { href: '/inventory/warehouse', label: 'Bodegas', icon: IconBuildingWarehouse },
  { href: '/inventory/on-site', label: 'On-site', icon: IconMapPin },
  { href: '/inventory/ledger', label: 'Movimientos', icon: IconArrowsShuffle },
  { href: '/inventory/equipos', label: 'Equipos', icon: IconTool },
  { href: '/inventory/remision-devolucion', label: 'Remisión/Devolución', special: true, icon: IconFileInvoice },
  { href: '/transport/cost', label: 'Transporte', icon: IconTruck },
  { href: '/transport/vehicles', label: 'Vehículos', icon: IconTruck },
  { href: '/transport/obras', label: 'Obras', icon: IconBuilding },
  { href: '/customers', label: 'Clientes', icon: IconUsers },
  { href: '/employees', label: 'Empleados', icon: IconUser }
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleLogout = () => {
    clearToken();
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
      <Link href="/" style={{ display: 'block' }}>
        <img
          src="/fiesta.svg"
          alt="Rev Logistica"
          style={{ height: 36, width: 'auto', display: 'block' }}
        />
      </Link>
      <Divider />
      <Stack gap={2}>
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.href}
              component={Link}
              href={link.href}
              label={link.label}
              active={pathname?.startsWith(link.href)}
              color={link.special ? 'green' : undefined}
              leftSection={<Icon size={16} />}
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
