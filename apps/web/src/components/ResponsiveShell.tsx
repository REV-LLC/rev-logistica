'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Nav from '@/components/Nav';

const routeTitles: Array<{ prefix: string; title: string; subtitle: string }> = [
  { prefix: '/transport/requests', title: 'Requests', subtitle: 'Daily operation' },
  { prefix: '/transport/cost', title: 'Transport', subtitle: 'Costs and dispatch' },
  { prefix: '/transport/vehicles', title: 'Vehicles', subtitle: 'Fleet and documents' },
  { prefix: '/transport/worksites', title: 'Worksites', subtitle: 'Active fronts' },
  { prefix: '/tasks', title: 'Tasks', subtitle: 'Operational follow-up' },
  { prefix: '/inventory/warehouse', title: 'Warehouses', subtitle: 'Inventory control' },
  { prefix: '/inventory/ledger', title: 'Movements', subtitle: 'Traceability' },
  { prefix: '/inventory/scaffold-modulations', title: 'Modulations', subtitle: 'Certified scaffold' },
  { prefix: '/inventory/bulk-adjustments', title: 'Add inventory', subtitle: 'Bulk entry' },
  { prefix: '/inventory/serialized-assets', title: 'Add inventory', subtitle: 'Unique equipment' },
  { prefix: '/billing/pre-invoice', title: 'Pre-invoice', subtitle: 'Period summary' },
  { prefix: '/customers', title: 'Customers', subtitle: 'Commercial relationship' },
  { prefix: '/employees', title: 'Employees', subtitle: 'Internal team' },
  { prefix: '/data', title: 'Data', subtitle: 'Backups and exports' },
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
      navbar={{ width: 284, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={{ base: 'xs', sm: 'md' }}
    >
      <AppShell.Header hiddenFrom="sm" px="sm">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} size="sm" aria-label="Open menu" />
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
              style={{ height: 30, width: 'auto', display: 'block' }}
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
