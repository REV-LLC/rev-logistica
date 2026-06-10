'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Nav from '@/components/Nav';

const routeTitles: Array<{ prefix: string; title: string; subtitle: string }> = [
  { prefix: '/transport/solicitudes', title: 'Solicitudes', subtitle: 'Operacion diaria' },
  { prefix: '/transport/cost', title: 'Transporte', subtitle: 'Costos y despacho' },
  { prefix: '/transport/vehicles', title: 'Vehiculos', subtitle: 'Flota y documentos' },
  { prefix: '/transport/obras', title: 'Obras', subtitle: 'Frentes activos' },
  { prefix: '/tasks', title: 'Pendientes', subtitle: 'Seguimiento operativo' },
  { prefix: '/inventory/warehouse', title: 'Bodegas', subtitle: 'Control de inventario' },
  { prefix: '/inventory/ledger', title: 'Movimientos', subtitle: 'Trazabilidad' },
  { prefix: '/inventory/bulk-adjustments', title: 'Agregar inventario', subtitle: 'Ingreso masivo' },
  { prefix: '/inventory/serialized-assets', title: 'Agregar inventario', subtitle: 'Equipos unicos' },
  { prefix: '/billing/prefactura', title: 'Prefactura', subtitle: 'Corte y resumen' },
  { prefix: '/customers', title: 'Clientes', subtitle: 'Relacion comercial' },
  { prefix: '/employees', title: 'Empleados', subtitle: 'Equipo interno' },
  { prefix: '/data', title: 'Datos', subtitle: 'Backups y exportes' },
];

function getHeaderCopy(pathname: string | null) {
  return routeTitles.find((item) => pathname?.startsWith(item.prefix)) ?? { title: 'Rev Logistica', subtitle: 'Panel operativo' };
}

export default function ResponsiveShell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();
  const headerCopy = getHeaderCopy(pathname);

  return (
    <AppShell
      header={{ height: { base: 56, sm: 0 } }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={{ base: 'xs', sm: 'md' }}
    >
      <AppShell.Header hiddenFrom="sm" px="sm">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} size="sm" aria-label="Abrir menú" />
            <div>
              <Text fw={700} size="sm" lh={1.1}>
                {headerCopy.title}
              </Text>
              <Text size="xs" c="dimmed" lh={1.1}>
                {headerCopy.subtitle}
              </Text>
            </div>
          </Group>
          <Link href="/" style={{ display: 'block' }} onClick={close}>
            <img
              src="/fiesta.svg"
              alt="Rev Logistica"
              style={{ height: 24, width: 'auto', display: 'block' }}
            />
          </Link>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar withBorder>
        <Nav onNavigate={close} />
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
