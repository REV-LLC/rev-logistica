'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconGauge, IconHistory, IconSearch } from '@tabler/icons-react';
import HourReadingHistory from '@/components/maintenance/HourReadingHistory';
import RecordHoursModal from '@/components/maintenance/RecordHoursModal';
import SerialAssetCard from '@/components/SerialAssetCard';
import { api } from '@/lib/api';
import {
  apiErrorMessage,
  type MaintenanceResponse,
  type MaintenanceSubject,
} from '@/lib/maintenance-types';

type OperatorAsset = {
  id: string;
  internalNumber: number;
  publicCode: string;
  serialOrEngine: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  currentHourMeter: number;
  warehouseOwner: { id: string; name: string; type: 'OWN' };
  warehouseCurrent?: { id: string; name: string } | null;
  sku?: { name?: string | null } | null;
};

const searchValue = (asset: OperatorAsset) =>
  [
    asset.publicCode,
    asset.internalNumber,
    asset.serialOrEngine,
    asset.description,
    asset.brand,
    asset.model,
    asset.sku?.name,
    asset.warehouseOwner.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es');

const assetDisplayName = (asset: OperatorAsset) =>
  asset.description?.trim() ||
  asset.sku?.name?.trim() ||
  [asset.brand, asset.model].filter(Boolean).join(' ') ||
  'Equipo serializado';

export default function HourMeterPage() {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [assets, setAssets] = useState<OperatorAsset[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OperatorAsset | null>(null);
  const [historyAsset, setHistoryAsset] = useState<OperatorAsset | null>(null);
  const [historyData, setHistoryData] = useState<MaintenanceResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await api<OperatorAsset[]>('/maintenance/operator/assets'));
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudieron cargar los equipos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleAssets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return query ? assets.filter((asset) => searchValue(asset).includes(query)) : assets;
  }, [assets, search]);

  const selectedSubject: MaintenanceSubject | null = selected
    ? {
        type: 'ASSET',
        id: selected.id,
        label: `${assetDisplayName(selected)} · ${selected.publicCode}`,
      }
    : null;

  const openHistory = async (asset: OperatorAsset) => {
    setHistoryAsset(asset);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      setHistoryData(await api<MaintenanceResponse>(`/maintenance/assets/${asset.id}`));
    } catch (err) {
      setHistoryError(apiErrorMessage(err, 'No se pudo cargar el historial de horas.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setHistoryAsset(null);
    setHistoryData(null);
    setHistoryError(null);
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" gap="md">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon size={46} radius="xl" variant="light" color="orange">
              <IconGauge size={24} />
            </ThemeIcon>
            <div>
              <Text fw={900} size="xl">Actualizar horómetro</Text>
              <Text c="dimmed" size="sm">
                Registra lecturas con evidencia fotográfica en equipos de bodegas propias.
              </Text>
            </div>
          </Group>
          <Badge color="orange" variant="light" size="lg">
            {assets.length} equipos
          </Badge>
        </Group>

        {error ? <Alert color="red">{error}</Alert> : null}
        {success ? (
          <Alert color="green" withCloseButton onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        ) : null}

        <TextInput
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Buscar por código, serial, referencia o bodega"
          leftSection={<IconSearch size={17} />}
        />

        {loading ? (
          <Paper withBorder radius="xl" p="xl">
            <Text c="dimmed" ta="center">Cargando equipos...</Text>
          </Paper>
        ) : visibleAssets.length ? (
          <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
            {visibleAssets.map((asset) => (
              <SerialAssetCard
                key={asset.id}
                item={{
                  assetId: asset.id,
                  internalNumber: asset.internalNumber,
                  serialOrEngine: asset.serialOrEngine,
                  description: asset.description,
                  skuName: asset.sku?.name,
                  brand: asset.brand,
                  model: asset.model,
                  imageUrl: asset.imageUrl,
                }}
                display={{ showOwnerChip: false, showSerial: false, showCharge: false }}
                compact
                statusBadge={{ label: `${asset.currentHourMeter} h`, color: 'blue' }}
                footer={
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    <Button
                      fullWidth
                      leftSection={<IconGauge size={17} />}
                      aria-label={`Registrar horas de ${assetDisplayName(asset)}`}
                      onClick={() => setSelected(asset)}
                    >
                      Registrar
                    </Button>
                    <Button
                      fullWidth
                      variant="default"
                      leftSection={<IconHistory size={17} />}
                      aria-label={`Ver historial de ${assetDisplayName(asset)}`}
                      onClick={() => void openHistory(asset)}
                    >
                      Ver historial
                    </Button>
                  </SimpleGrid>
                }
              />
            ))}
          </SimpleGrid>
        ) : (
          <Paper withBorder radius="xl" p="xl">
            <Text fw={700} ta="center">No hay equipos disponibles</Text>
            <Text size="sm" c="dimmed" ta="center">
              Solo se muestran activos de bodegas marcadas como propias.
            </Text>
          </Paper>
        )}
      </Stack>

      {selected && selectedSubject ? (
        <RecordHoursModal
          opened
          subject={selectedSubject}
          currentHours={selected.currentHourMeter}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await load();
            setSuccess(`Horómetro de ${assetDisplayName(selected)} actualizado correctamente.`);
          }}
        />
      ) : null}

      <Modal
        opened={Boolean(historyAsset)}
        onClose={closeHistory}
        title={historyAsset ? `Historial de horas · ${assetDisplayName(historyAsset)}` : 'Historial de horas'}
        size="xl"
        fullScreen={isMobile}
        radius={isMobile ? 0 : 'md'}
      >
        <Stack gap="md">
          {historyAsset ? (
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Text fw={800}>{historyAsset.publicCode}</Text>
                <Text size="sm" c="dimmed">
                  Serial / motor: {historyAsset.serialOrEngine}
                </Text>
              </div>
              <Badge color="blue" variant="light">
                {historyData?.currentHours ?? historyAsset.currentHourMeter} h actuales
              </Badge>
            </Group>
          ) : null}

          {historyLoading ? (
            <Paper withBorder radius="lg" p="xl">
              <Text c="dimmed" ta="center">Cargando historial...</Text>
            </Paper>
          ) : null}
          {historyError ? <Alert color="red">{historyError}</Alert> : null}
          {historyData ? <HourReadingHistory readings={historyData.readings} /> : null}
        </Stack>
      </Modal>
    </Container>
  );
}
