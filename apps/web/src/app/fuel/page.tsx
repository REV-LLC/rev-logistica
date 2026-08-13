'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Container, Group, Loader, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea, Title } from '@mantine/core';
import { IconBuildingWarehouse, IconGasStation, IconTool, IconTruck } from '@tabler/icons-react';
import { ApiError, api } from '@/lib/api';

type OptionData = {
  worksites: Array<{ id: string; name: string }>;
  assets: Array<{
    id: string;
    publicCode: string;
    serialOrEngine: string;
    description: string | null;
    sku: { name: string };
  }>;
  vehicles: Array<{
    id: string;
    plate: string;
    brand: string | null;
    model: string | null;
  }>;
  employees: Array<{
    id: string;
    name: string;
    lastName: string;
    role: string;
  }>;
};

type DashboardData = {
  worksiteBalances: Array<{
    id: string;
    name: string;
    receivedCans: number;
    usedCans: number;
    availableCans: number;
  }>;
  recentAssetFuelings: Array<{
    id: string;
    fueledAt: string;
    quantityCans: number;
    hourMeter: number;
    hoursSincePrevious: number | null;
    cansPerHour: number | null;
    worksite: { name: string };
    asset: {
      publicCode: string;
      description: string | null;
      sku: { name: string };
    };
    operator: { name: string; lastName: string } | null;
  }>;
  recentVehicleFuelings: Array<{
    id: string;
    fueledAt: string;
    quantityGallons: number;
    odometerKm: number;
    fullTank: boolean;
    totalCost: number | null;
    distanceKm: number | null;
    kmPerGallon: number | null;
    vehicle: { plate: string; brand: string | null; model: string | null };
    driver: { name: string; lastName: string } | null;
  }>;
};

type FormKind = 'receipt' | 'asset' | 'vehicle';

function localDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatNumber(value: number | null, digits = 1) {
  return value === null ? '—' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value);
}

function employeeName(employee: { name: string; lastName: string } | null) {
  return employee ? `${employee.name} ${employee.lastName}`.trim() : '—';
}

export default function FuelPage() {
  const [options, setOptions] = useState<OptionData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FormKind>('receipt');

  const [receipt, setReceipt] = useState({
    worksiteId: '',
    receivedAt: localDateTimeValue(),
    quantityCans: 1,
    notes: '',
  });
  const [assetFueling, setAssetFueling] = useState({
    worksiteId: '',
    assetId: '',
    fueledAt: localDateTimeValue(),
    quantityCans: 1,
    hourMeter: '',
    operatorEmployeeId: '',
    notes: '',
  });
  const [vehicleFueling, setVehicleFueling] = useState({
    vehicleId: '',
    fueledAt: localDateTimeValue(),
    quantityGallons: '',
    odometerKm: '',
    fullTank: false,
    totalCost: '',
    supplier: '',
    invoiceNumber: '',
    driverEmployeeId: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [optionData, dashboardData] = await Promise.all([api<OptionData>('/fuel/options'), api<DashboardData>('/fuel/dashboard')]);
      setOptions(optionData);
      setDashboard(dashboardData);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No fue posible cargar el módulo de combustible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const worksiteOptions = useMemo(
    () =>
      options?.worksites.map((item) => ({
        value: item.id,
        label: item.name,
      })) ?? [],
    [options],
  );
  const assetOptions = useMemo(
    () =>
      options?.assets.map((item) => ({
        value: item.id,
        label: `${item.publicCode} · ${item.sku.name}`,
      })) ?? [],
    [options],
  );
  const vehicleOptions = useMemo(
    () =>
      options?.vehicles.map((item) => ({
        value: item.id,
        label: `${item.plate} · ${[item.brand, item.model].filter(Boolean).join(' ') || 'Vehículo'}`,
      })) ?? [],
    [options],
  );
  const employeeOptions = useMemo(
    () =>
      options?.employees.map((item) => ({
        value: item.id,
        label: `${item.name} ${item.lastName}`.trim(),
      })) ?? [],
    [options],
  );

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (activeTab === 'receipt') {
        if (!receipt.worksiteId) throw new Error('Selecciona la obra.');
        await api('/fuel/worksite-receipts', {
          method: 'POST',
          json: {
            ...receipt,
            receivedAt: new Date(receipt.receivedAt).toISOString(),
          },
        });
        setReceipt((current) => ({
          ...current,
          quantityCans: 1,
          notes: '',
          receivedAt: localDateTimeValue(),
        }));
        setSuccess('Entrada de tarros registrada.');
      } else if (activeTab === 'asset') {
        if (!assetFueling.worksiteId || !assetFueling.assetId || assetFueling.hourMeter === '') throw new Error('Completa obra, máquina y horómetro.');
        await api('/fuel/asset-fillings', {
          method: 'POST',
          json: {
            ...assetFueling,
            fueledAt: new Date(assetFueling.fueledAt).toISOString(),
            hourMeter: Number(assetFueling.hourMeter),
            operatorEmployeeId: assetFueling.operatorEmployeeId || undefined,
          },
        });
        setAssetFueling((current) => ({
          ...current,
          quantityCans: 1,
          hourMeter: '',
          notes: '',
          fueledAt: localDateTimeValue(),
        }));
        setSuccess('Abastecimiento de máquina registrado.');
      } else {
        if (!vehicleFueling.vehicleId || vehicleFueling.quantityGallons === '' || vehicleFueling.odometerKm === '') throw new Error('Completa vehículo, galones y kilometraje.');
        await api('/fuel/vehicle-fillings', {
          method: 'POST',
          json: {
            ...vehicleFueling,
            fueledAt: new Date(vehicleFueling.fueledAt).toISOString(),
            quantityGallons: Number(vehicleFueling.quantityGallons),
            odometerKm: Number(vehicleFueling.odometerKm),
            totalCost: vehicleFueling.totalCost === '' ? undefined : Number(vehicleFueling.totalCost),
            driverEmployeeId: vehicleFueling.driverEmployeeId || undefined,
          },
        });
        setVehicleFueling((current) => ({
          ...current,
          quantityGallons: '',
          odometerKm: '',
          totalCost: '',
          supplier: '',
          invoiceNumber: '',
          notes: '',
          fueledAt: localDateTimeValue(),
        }));
        setSuccess('Tanqueada de vehículo registrada.');
      }
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="xl" py={{ base: 'sm', sm: 'lg' }}>
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">
            Control de combustible
          </Title>
          <Text c="dimmed" size="sm">
            Tarros disponibles en obra, horómetros de maquinaria y tanqueadas de vehículos.
          </Text>
        </div>

        {error ? (
          <Alert color="red" title="No se pudo completar la operación">
            {error}
          </Alert>
        ) : null}
        {success ? <Alert color="teal">{success}</Alert> : null}

        <Paper withBorder radius="md" p={{ base: 'sm', sm: 'lg' }}>
          <Tabs value={activeTab} onChange={(value) => setActiveTab((value ?? 'receipt') as FormKind)}>
            <Tabs.List grow>
              <Tabs.Tab value="receipt" leftSection={<IconBuildingWarehouse size={17} />}>
                Entrada a obra
              </Tabs.Tab>
              <Tabs.Tab value="asset" leftSection={<IconTool size={17} />}>
                Abastecer máquina
              </Tabs.Tab>
              <Tabs.Tab value="vehicle" leftSection={<IconTruck size={17} />}>
                Tanquear vehículo
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="receipt" pt="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                <Select
                  label="Obra"
                  required
                  searchable
                  data={worksiteOptions}
                  value={receipt.worksiteId}
                  onChange={(value) =>
                    setReceipt((current) => ({
                      ...current,
                      worksiteId: value ?? '',
                    }))
                  }
                />
                <TextInput
                  label="Fecha y hora"
                  required
                  type="datetime-local"
                  value={receipt.receivedAt}
                  onChange={(event) =>
                    setReceipt((current) => ({
                      ...current,
                      receivedAt: event.currentTarget.value,
                    }))
                  }
                />
                <NumberInput
                  label="Tarros recibidos"
                  required
                  min={0.5}
                  step={0.5}
                  decimalScale={1}
                  value={receipt.quantityCans}
                  onChange={(value) =>
                    setReceipt((current) => ({
                      ...current,
                      quantityCans: Number(value),
                    }))
                  }
                />
                <Textarea
                  label="Observaciones"
                  autosize
                  minRows={1}
                  value={receipt.notes}
                  onChange={(event) =>
                    setReceipt((current) => ({
                      ...current,
                      notes: event.currentTarget.value,
                    }))
                  }
                />
              </SimpleGrid>
            </Tabs.Panel>

            <Tabs.Panel value="asset" pt="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                <Select
                  label="Obra"
                  required
                  searchable
                  data={worksiteOptions}
                  value={assetFueling.worksiteId}
                  onChange={(value) =>
                    setAssetFueling((current) => ({
                      ...current,
                      worksiteId: value ?? '',
                    }))
                  }
                />
                <Select
                  label="Máquina"
                  required
                  searchable
                  data={assetOptions}
                  value={assetFueling.assetId}
                  onChange={(value) =>
                    setAssetFueling((current) => ({
                      ...current,
                      assetId: value ?? '',
                    }))
                  }
                />
                <TextInput
                  label="Fecha y hora"
                  required
                  type="datetime-local"
                  value={assetFueling.fueledAt}
                  onChange={(event) =>
                    setAssetFueling((current) => ({
                      ...current,
                      fueledAt: event.currentTarget.value,
                    }))
                  }
                />
                <NumberInput
                  label="Tarros colocados"
                  required
                  min={0.5}
                  step={0.5}
                  decimalScale={1}
                  value={assetFueling.quantityCans}
                  onChange={(value) =>
                    setAssetFueling((current) => ({
                      ...current,
                      quantityCans: Number(value),
                    }))
                  }
                />
                <NumberInput
                  label="Lectura del horómetro"
                  required
                  min={0}
                  step={0.1}
                  decimalScale={2}
                  value={assetFueling.hourMeter}
                  onChange={(value) =>
                    setAssetFueling((current) => ({
                      ...current,
                      hourMeter: String(value),
                    }))
                  }
                />
                <Select
                  label="Operador"
                  clearable
                  searchable
                  data={employeeOptions}
                  value={assetFueling.operatorEmployeeId || null}
                  onChange={(value) =>
                    setAssetFueling((current) => ({
                      ...current,
                      operatorEmployeeId: value ?? '',
                    }))
                  }
                />
              </SimpleGrid>
              <Textarea
                mt="md"
                label="Observaciones"
                autosize
                minRows={1}
                value={assetFueling.notes}
                onChange={(event) =>
                  setAssetFueling((current) => ({
                    ...current,
                    notes: event.currentTarget.value,
                  }))
                }
              />
            </Tabs.Panel>

            <Tabs.Panel value="vehicle" pt="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                <Select
                  label="Vehículo"
                  required
                  searchable
                  data={vehicleOptions}
                  value={vehicleFueling.vehicleId}
                  onChange={(value) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      vehicleId: value ?? '',
                    }))
                  }
                />
                <TextInput
                  label="Fecha y hora"
                  required
                  type="datetime-local"
                  value={vehicleFueling.fueledAt}
                  onChange={(event) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      fueledAt: event.currentTarget.value,
                    }))
                  }
                />
                <NumberInput
                  label="Galones"
                  required
                  min={0.001}
                  step={0.1}
                  decimalScale={3}
                  value={vehicleFueling.quantityGallons}
                  onChange={(value) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      quantityGallons: String(value),
                    }))
                  }
                />
                <NumberInput
                  label="Kilometraje"
                  required
                  min={0}
                  step={1}
                  decimalScale={1}
                  value={vehicleFueling.odometerKm}
                  onChange={(value) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      odometerKm: String(value),
                    }))
                  }
                />
                <NumberInput
                  label="Costo total"
                  min={0}
                  prefix="$ "
                  thousandSeparator="."
                  decimalSeparator=","
                  value={vehicleFueling.totalCost}
                  onChange={(value) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      totalCost: String(value),
                    }))
                  }
                />
                <TextInput
                  label="Estación o proveedor"
                  value={vehicleFueling.supplier}
                  onChange={(event) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      supplier: event.currentTarget.value,
                    }))
                  }
                />
                <TextInput
                  label="Factura"
                  value={vehicleFueling.invoiceNumber}
                  onChange={(event) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      invoiceNumber: event.currentTarget.value,
                    }))
                  }
                />
                <Select
                  label="Conductor"
                  clearable
                  searchable
                  data={employeeOptions}
                  value={vehicleFueling.driverEmployeeId || null}
                  onChange={(value) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      driverEmployeeId: value ?? '',
                    }))
                  }
                />
              </SimpleGrid>
              <Group mt="md" align="flex-end">
                <Checkbox
                  label="Tanque lleno"
                  checked={vehicleFueling.fullTank}
                  onChange={(event) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      fullTank: event.currentTarget.checked,
                    }))
                  }
                />
                <Textarea
                  style={{ flex: 1 }}
                  label="Observaciones"
                  autosize
                  minRows={1}
                  value={vehicleFueling.notes}
                  onChange={(event) =>
                    setVehicleFueling((current) => ({
                      ...current,
                      notes: event.currentTarget.value,
                    }))
                  }
                />
              </Group>
            </Tabs.Panel>
          </Tabs>

          <Group justify="flex-end" mt="lg">
            <Button leftSection={<IconGasStation size={18} />} loading={saving} onClick={() => void submit()} color="yellow.7">
              Registrar
            </Button>
          </Group>
        </Paper>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader color="yellow.7" />
          </Group>
        ) : dashboard ? (
          <Stack gap="lg">
            <Paper withBorder radius="md" p="md">
              <Title order={2} size="h4" mb="sm">
                Saldo en obra
              </Title>
              <ScrollArea>
                <Table striped highlightOnHover miw={600}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Obra</Table.Th>
                      <Table.Th ta="right">Recibidos</Table.Th>
                      <Table.Th ta="right">Usados</Table.Th>
                      <Table.Th ta="right">Disponibles</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {dashboard.worksiteBalances.length ? (
                      dashboard.worksiteBalances.map((row) => (
                        <Table.Tr key={row.id}>
                          <Table.Td fw={600}>{row.name}</Table.Td>
                          <Table.Td ta="right">{formatNumber(row.receivedCans)} tarros</Table.Td>
                          <Table.Td ta="right">{formatNumber(row.usedCans)} tarros</Table.Td>
                          <Table.Td ta="right" fw={700} c={row.availableCans <= 1 ? 'red' : undefined}>
                            {formatNumber(row.availableCans)} tarros
                          </Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text c="dimmed" ta="center">
                            Aún no hay combustible registrado en obras.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Title order={2} size="h4" mb="sm">
                Abastecimientos de maquinaria
              </Title>
              <ScrollArea>
                <Table striped highlightOnHover miw={900}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Obra</Table.Th>
                      <Table.Th>Máquina</Table.Th>
                      <Table.Th ta="right">Tarros</Table.Th>
                      <Table.Th ta="right">Horómetro</Table.Th>
                      <Table.Th ta="right">Horas desde anterior</Table.Th>
                      <Table.Th>Operador</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {dashboard.recentAssetFuelings.length ? (
                      dashboard.recentAssetFuelings.map((row) => (
                        <Table.Tr key={row.id}>
                          <Table.Td>{formatDate(row.fueledAt)}</Table.Td>
                          <Table.Td>{row.worksite.name}</Table.Td>
                          <Table.Td>
                            <Text fw={600} size="sm">
                              {row.asset.publicCode}
                            </Text>
                            <Text c="dimmed" size="xs">
                              {row.asset.sku.name}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">{formatNumber(row.quantityCans)}</Table.Td>
                          <Table.Td ta="right">{formatNumber(row.hourMeter, 2)} h</Table.Td>
                          <Table.Td ta="right">{formatNumber(row.hoursSincePrevious, 2)}</Table.Td>
                          <Table.Td>{employeeName(row.operator)}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text c="dimmed" ta="center">
                            Aún no hay abastecimientos de maquinaria.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Title order={2} size="h4" mb="sm">
                Tanqueadas de vehículos
              </Title>
              <ScrollArea>
                <Table striped highlightOnHover miw={900}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Vehículo</Table.Th>
                      <Table.Th ta="right">Galones</Table.Th>
                      <Table.Th ta="right">Kilometraje</Table.Th>
                      <Table.Th ta="right">Distancia</Table.Th>
                      <Table.Th ta="right">km/galón</Table.Th>
                      <Table.Th>Conductor</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {dashboard.recentVehicleFuelings.length ? (
                      dashboard.recentVehicleFuelings.map((row) => (
                        <Table.Tr key={row.id}>
                          <Table.Td>{formatDate(row.fueledAt)}</Table.Td>
                          <Table.Td>
                            <Text fw={600} size="sm">
                              {row.vehicle.plate}
                            </Text>
                            <Text c="dimmed" size="xs">
                              {[row.vehicle.brand, row.vehicle.model].filter(Boolean).join(' ')}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">{formatNumber(row.quantityGallons, 3)}</Table.Td>
                          <Table.Td ta="right">{formatNumber(row.odometerKm)} km</Table.Td>
                          <Table.Td ta="right">{row.fullTank ? `${formatNumber(row.distanceKm)} km` : '—'}</Table.Td>
                          <Table.Td ta="right">{row.fullTank ? formatNumber(row.kmPerGallon, 2) : '—'}</Table.Td>
                          <Table.Td>{employeeName(row.driver)}</Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text c="dimmed" ta="center">
                            Aún no hay tanqueadas de vehículos.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          </Stack>
        ) : null}
      </Stack>
    </Container>
  );
}
