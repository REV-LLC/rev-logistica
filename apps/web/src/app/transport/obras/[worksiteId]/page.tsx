'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ActionIcon, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import InventoryDisplay from '@/components/InventoryDisplay';
import LedgerTable, { LedgerItem } from '@/components/LedgerTable';

type WorksiteOption = {
  id: string;
  alias: string | null;
  active: boolean;
  customer: { id: string; name: string; active: boolean };
  worksite: { id: string; name: string; address: string | null; active: boolean };
};

type InventoryResponse = {
  customerWorksiteId: string;
  bulk: {
    skuId: string;
    skuName: string | null;
    category?: string | null;
    imageUrl: string | null;
    imageFileObjectId: string | null;
    quantity: number;
  }[];
  serial: {
    assetId: string;
    serialOrEngine: string | null;
    description: string | null;
    skuName?: string | null;
    imageUrl?: string | null;
    brand?: string | null;
    model?: string | null;
    status?: string | null;
    imageFileObjectId: string | null;
    quantity: number;
  }[];
};

type LedgerResponse = {
  items: LedgerItem[];
  nextCursor: string | null;
};

export default function ObraDetailPage() {
  const router = useRouter();
  const params = useParams<{ worksiteId: string }>();
  const worksiteId = params?.worksiteId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worksite, setWorksite] = useState<WorksiteOption | null>(null);
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);

  useEffect(() => {
    if (!worksiteId) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [worksitesData, inventoryData, ledgerData] = await Promise.all([
          api<WorksiteOption[]>('/worksites', { method: 'GET' }),
          api<InventoryResponse>(`/inventory/on-site/${worksiteId}`, { method: 'GET' }),
          api<LedgerResponse>(
            `/inventory/ledger?customerWorksiteId=${worksiteId}&take=20`,
            { method: 'GET' },
          ),
        ]);
        if (!mounted) return;
        setWorksite(worksitesData.find((item) => item.id === worksiteId) ?? null);
        setInventory(inventoryData);
        setLedgerItems(ledgerData.items ?? []);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error cargando información de la obra');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [worksiteId]);

  const pageTitle = useMemo(() => {
    if (!worksite) return 'Obra';
    return `${worksite.customer.name} / ${worksite.worksite.name}`;
  }, [worksite]);

  return (
    <main>
      <Container size="xl" py="xl">
        <ActionIcon variant="light" size="lg" mb="sm" aria-label="Volver" onClick={() => router.back()}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Group justify="space-between" className="mobile-stack" mb="sm">
            <div>
              <Title order={2}>{pageTitle}</Title>
              <Text c="dimmed">Detalle de obra e inventario on-site.</Text>
            </div>
            <Group>
              {worksite ? (
                <Button variant="default" component={Link} href={`/customers?customerId=${worksite.customer.id}`}>
                  Ver cliente
                </Button>
              ) : null}
            </Group>
          </Group>

          {loading ? <Text c="dimmed">Cargando...</Text> : null}
          {error ? (
            <Text c="red" mt="sm">
              {error}
            </Text>
          ) : null}

          {worksite ? (
            <Stack gap="xs" mt="sm">
              <Text><strong>Cliente:</strong> {worksite.customer.name}</Text>
              <Text><strong>Obra:</strong> {worksite.worksite.name}</Text>
              <Text><strong>Dirección:</strong> {worksite.worksite.address ?? '-'}</Text>
              <Text><strong>Alias:</strong> {worksite.alias ?? '-'}</Text>
              <Text><strong>Estado:</strong> {worksite.active ? 'Activa' : 'Inactiva'}</Text>
            </Stack>
          ) : null}
        </Paper>

        {inventory ? (
          <div style={{ marginTop: 24 }}>
            <InventoryDisplay
              bulk={inventory.bulk}
              serial={inventory.serial}
              bulkOwnerStackMode
              isWorksiteView
              serialSectionTitle={`MAQUINARIA EN ${worksite?.worksite.name ?? 'OBRA'}`}
            />
          </div>
        ) : null}

        <Paper shadow="sm" p="xl" radius="md" withBorder mt="md">
          <Title order={4}>Movimientos recientes de la obra</Title>
          {ledgerItems.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <LedgerTable items={ledgerItems} />
            </div>
          ) : (
            <Text c="dimmed" mt="sm">
              No hay movimientos recientes para esta obra.
            </Text>
          )}
        </Paper>
      </Container>
    </main>
  );
}
