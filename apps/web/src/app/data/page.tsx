'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Container, Stack, Tabs } from '@mantine/core';
import { IconDatabaseExport, IconFileSpreadsheet } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import BalanceReportsPanel from '@/components/data/BalanceReportsPanel';
import { getCurrentUserRole } from '@/lib/auth';

const DataBackupsPanel = dynamic(
  () => import('@/components/data/DataBackupsPanel'),
);

export default function DataPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(getCurrentUserRole() === 'ADMIN');
  }, []);
  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <PageHeaderCard
          title="Exportar datos"
          description="Descarga tus saldos de inventario en Excel."
          icon={<IconFileSpreadsheet size={22} />}
          iconColor="green"
          accentColor="rgba(34, 139, 230, 0.12)"
        />
        {isAdmin ? (
          <Tabs defaultValue="balances" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab
                value="balances"
                leftSection={<IconFileSpreadsheet size={17} />}
              >
                Saldos
              </Tabs.Tab>
              <Tabs.Tab
                value="backups"
                leftSection={<IconDatabaseExport size={17} />}
              >
                Respaldos técnicos
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="balances" pt="md">
              <BalanceReportsPanel />
            </Tabs.Panel>
            <Tabs.Panel value="backups" pt="md">
              <DataBackupsPanel />
            </Tabs.Panel>
          </Tabs>
        ) : (
          <BalanceReportsPanel />
        )}
      </Stack>
    </Container>
  );
}
