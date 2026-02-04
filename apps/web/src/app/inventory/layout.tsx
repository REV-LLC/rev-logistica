'use client';

import { AppShell } from '@mantine/core';
import AuthGuard from '@/components/AuthGuard';
import Nav from '@/components/Nav';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell navbar={{ width: 260, breakpoint: 'sm' }} padding="md">
        <AppShell.Navbar withBorder>
          <Nav />
        </AppShell.Navbar>
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
    </AuthGuard>
  );
}
