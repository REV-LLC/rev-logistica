'use client';

import Link from 'next/link';
import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Nav from '@/components/Nav';

export default function ResponsiveShell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure(false);

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
            <Text fw={700} size="sm">
              Rev Logistica
            </Text>
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
