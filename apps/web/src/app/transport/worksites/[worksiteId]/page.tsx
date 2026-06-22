'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBuildingEstate,
  IconMapPin,
  IconRoute2,
  IconTruck,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
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
    ownerWarehouseId?: string | null;
    skuName: string | null;
    ownerWarehouseName?: string | null;
    category?: string | null;
    imageUrl: string | null;
    imageFileObjectId: string | null;
    quantity: number;
  }[];
  serial: {
    assetId: string;
    ownerWarehouseId?: string | null;
    serialOrEngine: string | null;
    description: string | null;
    skuName?: string | null;
    ownerWarehouseName?: string | null;
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
  const isMobile = useMediaQuery('(max-width: 768px)');

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
          setError('Error loading worksite information');
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

  const worksiteMetrics = useMemo(() => {
    const bulkItems = inventory?.bulk ?? [];
    const serialItems = inventory?.serial ?? [];
    const bulkUnits = bulkItems.reduce((sum, item) => sum + item.quantity, 0);
    const serialUnits = serialItems.reduce((sum, item) => sum + item.quantity, 0);
    const ownerEntries = new Map<string, { id: string; name: string; bulk: number; serial: number }>();

    bulkItems.forEach((item) => {
      const ownerId = item.ownerWarehouseId ?? 'unknown';
      const ownerName = item.ownerWarehouseName ?? 'Sin dueño';
      const current = ownerEntries.get(ownerId) ?? { id: ownerId, name: ownerName, bulk: 0, serial: 0 };
      current.bulk += item.quantity;
      ownerEntries.set(ownerId, current);
    });

    serialItems.forEach((item) => {
      const ownerId = item.ownerWarehouseId ?? 'unknown';
      const ownerName = item.ownerWarehouseName ?? 'Sin dueño';
      const current = ownerEntries.get(ownerId) ?? { id: ownerId, name: ownerName, bulk: 0, serial: 0 };
      current.serial += item.quantity;
      ownerEntries.set(ownerId, current);
    });

    const owners = Array.from(ownerEntries.values()).sort(
      (a, b) => b.bulk + b.serial - (a.bulk + a.serial),
    );

    return {
      bulkSkus: bulkItems.length,
      bulkUnits,
      serialAssets: serialItems.length,
      serialUnits,
      recentMoves: ledgerItems.length,
      owners,
    };
  }, [inventory, ledgerItems]);

  return (
    <main>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <ActionIcon variant="light" size="lg" aria-label="Volver" onClick={() => router.back()}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <Group gap="xs" wrap="wrap">
              {worksite ? (
                <Button variant="default" component={Link} href={`/customers?customerId=${worksite.customer.id}`}>
                  View customer
                </Button>
              ) : null}
              <Button variant="light" component={Link} href={`/inventory/ledger?customerWorksiteId=${worksiteId ?? ''}`}>
                View full ledger
              </Button>
            </Group>
          </Group>

          <PageHeaderCard
            title={pageTitle}
            description="Inventario en obra, responsabilidad por dueño y trazabilidad reciente del frente operativo."
            icon={<IconBuildingEstate size={20} />}
            iconColor="blue"
            accentColor="rgba(59,130,246,0.12)"
            aside={
              worksite ? (
                <Badge color={worksite.active ? 'green' : 'gray'} variant="light" size="lg">
                  {worksite.active ? 'Obra activa' : 'Obra inactiva'}
                </Badge>
              ) : null
            }
          >
            {loading ? (
              <Group gap="sm">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Cargando detalle de obra...
                </Text>
              </Group>
            ) : null}

            {worksite ? (
              <>
                <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
                  <StatCard
                    label="Stock masivo"
                    value={String(worksiteMetrics.bulkUnits)}
                    hint={`${worksiteMetrics.bulkSkus} referencias activas en sitio`}
                    color="blue"
                    icon={<IconRoute2 size={20} />}
                  />
                  <StatCard
                    label="Equipos unicos"
                    value={String(worksiteMetrics.serialAssets)}
                    hint={`${worksiteMetrics.serialUnits} equipos serializados visibles`}
                    color="teal"
                    icon={<IconTruck size={20} />}
                  />
                  <StatCard
                    label="Dueños presentes"
                    value={String(worksiteMetrics.owners.length)}
                    hint="Empresas dueñas representadas en obra"
                    color="grape"
                    icon={<IconBuildingEstate size={20} />}
                  />
                  <StatCard
                    label="Movimientos recientes"
                    value={String(worksiteMetrics.recentMoves)}
                    hint="Ultimos registros cargados en el ledger"
                    color="orange"
                    icon={<IconArrowRight size={20} />}
                  />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
                  <Paper withBorder radius="lg" p="md">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Cliente
                    </Text>
                    <Text fw={700} mt={6}>
                      {worksite.customer.name}
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      Relacion comercial de la obra
                    </Text>
                  </Paper>
                  <Paper withBorder radius="lg" p="md">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Alias operativo
                    </Text>
                    <Text fw={700} mt={6}>
                      {worksite.alias ?? 'Sin alias'}
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      Nombre corto usado en operacion
                    </Text>
                  </Paper>
                  <Paper withBorder radius="lg" p="md">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Direccion
                    </Text>
                    <Text fw={700} mt={6}>
                      {worksite.worksite.address ?? 'Sin direccion registrada'}
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      Ubicacion base del frente
                    </Text>
                  </Paper>
                  <Paper withBorder radius="lg" p="md">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Acciones rapidas
                    </Text>
                    <Stack gap={6} mt={6}>
                      <Button
                        size="xs"
                        variant="light"
                        component={Link}
                        href="/transport/requests"
                        justify="space-between"
                        rightSection={<IconArrowRight size={14} />}
                      >
                        Ir a solicitudes
                      </Button>
                      {worksite.worksite.address ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          component="a"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(worksite.worksite.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          justify="space-between"
                          rightSection={<IconMapPin size={14} />}
                        >
                          Abrir en mapas
                        </Button>
                      ) : null}
                    </Stack>
                  </Paper>
                </SimpleGrid>

              </>
            ) : null}
          </PageHeaderCard>

          {error ? (
            <Alert color="red" variant="light" title="No se pudo cargar la obra">
              {error}
            </Alert>
          ) : null}

          {inventory ? (
            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <div>
                  <Text fw={700}>Inventario en obra</Text>
                  <Text size="sm" c="dimmed">
                    Equipos y materiales asociados actualmente a este frente. Los colores por dueño se conservan en cada grupo.
                  </Text>
                </div>
                <InventoryDisplay
                  bulk={inventory.bulk}
                  serial={inventory.serial}
                  bulkOwnerStackMode
                  isWorksiteView
                  serialSectionTitle={`MAQUINARIA EN ${worksite?.worksite.name ?? 'OBRA'}`}
                />
              </Stack>
            </Paper>
          ) : null}

          <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
            <Stack gap="md">
              <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                <div>
                  <Text fw={700}>Movimientos recientes</Text>
                  <Text size="sm" c="dimmed">
                    Ultimos registros del ledger relacionados con esta obra.
                  </Text>
                </div>
                <Badge color="gray" variant="light">
                  {ledgerItems.length} registros
                </Badge>
              </Group>
              {ledgerItems.length > 0 ? (
                <LedgerTable items={ledgerItems} />
              ) : (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Text fw={700}>No hay movimientos recientes para esta obra.</Text>
                  <Text size="sm" c="dimmed" mt={6}>
                    Cuando entren o salgan equipos y materiales, la trazabilidad aparecera aqui.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </main>
  );
}
