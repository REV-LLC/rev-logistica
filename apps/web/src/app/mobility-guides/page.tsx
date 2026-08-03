'use client';

import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFilePlus, IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SerialAssetCard from '@/components/SerialAssetCard';
import MobilityGuideListModal from '@/components/mobility-guides/MobilityGuideListModal';
import { getMobilityGuideStatus } from '@/components/mobility-guides/MobilityGuideStatus';
import PublishMobilityGuideModal from '@/components/mobility-guides/PublishMobilityGuideModal';
import { api } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';

type MobilityAsset = {
  assetId: string;
  serialOrEngine: string;
  registrationNumber: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  internalNumber: number;
  ownerWarehouseId?: string | null;
  ownerWarehouseName?: string | null;
  imageFileObjectId?: string | null;
  imageUrl?: string | null;
  skuName?: string | null;
  chargeType?: string | null;
  minimumChargeHours?: number | string | null;
  guideCount: number;
  latestGuide?: { id: string; expiresAt: string } | null;
};

export default function MobilityGuidesPage() {
  const role = getCurrentUserRole();
  const canManage = role === 'ADMIN' || role === 'OFFICE';
  const [assets, setAssets] = useState<MobilityAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MobilityAsset | null>(null);
  const [listOpened, setListOpened] = useState(false);
  const [publishOpened, setPublishOpened] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = debouncedSearch.trim() ? `?search=${encodeURIComponent(debouncedSearch.trim())}` : '';
      setAssets(await api<MobilityAsset[]>(`/mobility-guides/assets${query}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los activos.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    let valid = 0;
    let attention = 0;
    for (const asset of assets) {
      const status = getMobilityGuideStatus(asset.latestGuide?.expiresAt);
      if (status.color === 'green') valid += 1;
      if (status.color === 'red' || status.color === 'yellow' || status.color === 'gray') attention += 1;
    }
    return { valid, attention };
  }, [assets]);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text component="h1" fw={800} fz={{ base: 26, sm: 32 }}>Guias de movilidad</Text>
            <Text c="dimmed">Consulta, publica y controla la vigencia de las guias por activo.</Text>
          </div>
          {canManage ? (
            <Button leftSection={<IconFilePlus size={18} />} onClick={() => setPublishOpened(true)}>
              Publicar guia
            </Button>
          ) : null}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Paper withBorder radius="lg" p="md"><Text size="xs" c="dimmed">ACTIVOS CON REGISTRO</Text><Text fw={800} fz={26}>{assets.length}</Text></Paper>
          <Paper withBorder radius="lg" p="md"><Text size="xs" c="dimmed">GUIA VIGENTE</Text><Text fw={800} fz={26} c="green">{counts.valid}</Text></Paper>
          <Paper withBorder radius="lg" p="md"><Text size="xs" c="dimmed">REQUIEREN ATENCION</Text><Text fw={800} fz={26} c="orange">{counts.attention}</Text></Paper>
        </SimpleGrid>

        <TextInput
          aria-label="Buscar activos"
          placeholder="Buscar por equipo, serial o numero de registro"
          leftSection={<IconSearch size={18} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />

        {error ? <Alert color="red">{error}</Alert> : null}
        {loading ? <Group justify="center" py="xl"><Loader /></Group> : null}
        {!loading && assets.length === 0 ? (
          <Paper withBorder p="xl" radius="lg">
            <Text ta="center" c="dimmed">
              No hay activos activos con numero de registro.
            </Text>
          </Paper>
        ) : null}
        <SimpleGrid
          cols={{ base: 1, sm: 2, md: 3, lg: 4 }}
          spacing={{ base: 'sm', sm: 'md', lg: 'lg' }}
          verticalSpacing={{ base: 'sm', sm: 'md', lg: 'lg' }}
        >
          {assets.map((asset) => (
            <SerialAssetCard
              key={asset.assetId}
              item={asset}
              display={{ showSerial: false, showCharge: false }}
              statusBadge={getMobilityGuideStatus(asset.latestGuide?.expiresAt)}
              additionalDetails={[
                { label: 'Registro', value: asset.registrationNumber },
                { label: 'Guias publicadas', value: asset.guideCount },
              ]}
              onOpen={() => {
                setSelectedAsset(asset);
                setListOpened(true);
              }}
            />
          ))}
        </SimpleGrid>
      </Stack>

      <MobilityGuideListModal
        asset={selectedAsset}
        canManage={canManage}
        opened={listOpened}
        onClose={() => setListOpened(false)}
        onChanged={load}
      />
      {canManage ? (
        <PublishMobilityGuideModal
          assets={assets}
          initialAssetId={selectedAsset?.assetId}
          opened={publishOpened}
          onClose={() => setPublishOpened(false)}
          onPublished={load}
        />
      ) : null}
    </Container>
  );
}
