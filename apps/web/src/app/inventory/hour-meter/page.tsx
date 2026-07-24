'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconBuildingWarehouse, IconGauge, IconSearch } from '@tabler/icons-react';
import RecordHoursModal from '@/components/maintenance/RecordHoursModal';
import { api } from '@/lib/api';
import { apiErrorMessage, type MaintenanceSubject } from '@/lib/maintenance-types';

type OperatorAsset = {
  id: string;
  publicCode: string;
  serialOrEngine: string;
  brand?: string | null;
  model?: string | null;
  currentHourMeter: number;
  warehouseOwner: { id: string; name: string; type: 'OWN' };
  warehouseCurrent?: { id: string; name: string } | null;
  sku?: { name?: string | null } | null;
};

const searchValue = (asset: OperatorAsset) =>
  [
    asset.publicCode,
    asset.serialOrEngine,
    asset.brand,
    asset.model,
    asset.sku?.name,
    asset.warehouseOwner.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es');

export default function HourMeterPage() {
  const [assets, setAssets] = useState<OperatorAsset[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OperatorAsset | null>(null);
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
    ? { type: 'ASSET', id: selected.id, label: selected.publicCode }
    : null;

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
              <Paper key={asset.id} withBorder radius="xl" p="lg">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div>
                      <Text fw={900}>{asset.publicCode}</Text>
                      <Text size="sm" c="dimmed">
                        {asset.sku?.name || [asset.brand, asset.model].filter(Boolean).join(' ') || 'Equipo serializado'}
                      </Text>
                    </div>
                    <Badge color="blue" variant="light">{asset.currentHourMeter} h</Badge>
                  </Group>
                  <Stack gap={4}>
                    <Text size="xs" c="dimmed">Serial / motor</Text>
                    <Text size="sm" fw={600}>{asset.serialOrEngine}</Text>
                    <Group gap={6} wrap="nowrap">
                      <IconBuildingWarehouse size={15} />
                      <Text size="sm">{asset.warehouseOwner.name}</Text>
                    </Group>
                  </Stack>
                  <Button leftSection={<IconGauge size={17} />} onClick={() => setSelected(asset)}>
                    Registrar nueva lectura
                  </Button>
                </Stack>
              </Paper>
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
            setSuccess(`Horómetro de ${selected.publicCode} actualizado correctamente.`);
          }}
        />
      ) : null}
    </Container>
  );
}
