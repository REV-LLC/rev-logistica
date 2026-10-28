'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconEye, IconFileSpreadsheet } from '@tabler/icons-react';
import { api } from '@/lib/api';
import {
  balanceItemLabel,
  balanceLocationLabels,
  balanceReportKinds,
} from '@/lib/balance-report';
import { exportBalanceReport, getBalanceReport } from '@/lib/balance-export';
import type {
  BalanceOwnership,
  BalanceReport,
  BalanceReportKind,
  BalanceReportOptions,
} from '@/lib/balance-report';

const emptyOptions: BalanceReportOptions = { worksites: [], warehouses: [] };
export default function BalanceReportsPanel() {
  const [options, setOptions] = useState(emptyOptions);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [kind, setKind] = useState<BalanceReportKind>('general');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerWorksiteId, setCustomerWorksiteId] = useState<string | null>(
    null,
  );
  const [providerId, setProviderId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<BalanceOwnership>('ALL');
  const [busy, setBusy] = useState<'preview' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BalanceReport | null>(null);
  const byCustomer = kind === 'worksites' || kind === 'customers';

  useEffect(() => {
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError(null);
    api<BalanceReportOptions>('/inventory/reports/options', {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setOptions(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setOptionsError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar los filtros.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOptions(false);
      });
    return () => controller.abort();
  }, [reload]);

  const customers = useMemo(
    () =>
      [
        ...new Map(
          options.worksites.map((site) => [
            site.customer.id,
            { value: site.customer.id, label: site.customer.name },
          ]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [options.worksites],
  );
  const providers = useMemo(
    () =>
      [
        ...new Map(
          options.warehouses
            .filter(
              (warehouse) => warehouse.ownerCompany.category === 'PROVIDER',
            )
            .map((warehouse) => [
              warehouse.ownerCompany.id,
              {
                value: warehouse.ownerCompany.id,
                label: warehouse.ownerCompany.name,
              },
            ]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [options.warehouses],
  );
  const sites = useMemo(
    () =>
      options.worksites
        .filter((site) => !customerId || site.customer.id === customerId)
        .map((site) => ({
          value: site.id,
          label: `${site.worksite.name}${site.alias ? ` · ${site.alias}` : ''}${!customerId ? ` — ${site.customer.name}` : ''}${!site.active ? ' (inactiva)' : ''}`,
        })),
    [options.worksites, customerId],
  );

  const clearResult = () => {
    setResult(null);
    setError(null);
  };
  const generate = async (download: boolean) => {
    if (busy) return;
    setBusy(download ? 'download' : 'preview');
    setError(null);
    setResult(null);
    try {
      const query = {
        report: kind,
        customerId: customerId ?? undefined,
        customerWorksiteId: customerWorksiteId ?? undefined,
        providerId: providerId ?? undefined,
        warehouseId: warehouseId ?? undefined,
        ownership,
      };
      const report = await (download
        ? exportBalanceReport(query)
        : getBalanceReport(query));
      setResult(report);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo generar el reporte.',
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Stack gap="md">
      <Paper withBorder p={{ base: 'sm', sm: 'lg' }} radius="lg">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            <Select
              label="Reporte"
              data={balanceReportKinds}
              value={kind}
              allowDeselect={false}
              disabled={Boolean(busy)}
              onChange={(value) => {
                if (!value) return;
                setKind(value as BalanceReportKind);
                setCustomerId(null);
                setCustomerWorksiteId(null);
                setProviderId(null);
                setWarehouseId(null);
                setOwnership('ALL');
                clearResult();
              }}
            />
            {byCustomer ? (
              <>
                <Select
                  label="Cliente"
                  placeholder="Todos los clientes"
                  searchable
                  clearable
                  data={customers}
                  value={customerId}
                  disabled={Boolean(busy) || loadingOptions}
                  onChange={(value) => {
                    setCustomerId(value);
                    setCustomerWorksiteId(null);
                    clearResult();
                  }}
                />
                <Select
                  label="Obra"
                  placeholder="Todas las obras"
                  searchable
                  clearable
                  data={sites}
                  value={customerWorksiteId}
                  disabled={Boolean(busy) || loadingOptions}
                  onChange={(value) => {
                    setCustomerWorksiteId(value);
                    clearResult();
                  }}
                />
              </>
            ) : null}
            {kind === 'providers' ? (
              <Select
                label="Proveedor"
                placeholder="Todos los proveedores"
                searchable
                clearable
                data={providers}
                value={providerId}
                disabled={Boolean(busy) || loadingOptions}
                onChange={(value) => {
                  setProviderId(value);
                  clearResult();
                }}
              />
            ) : (
              <Select
                label="Propiedad"
                allowDeselect={false}
                data={[
                  { value: 'ALL', label: 'Propio y de proveedores' },
                  { value: 'INTERNAL', label: 'Solo propio' },
                  { value: 'PROVIDER', label: 'Solo de proveedores' },
                ]}
                value={ownership}
                disabled={Boolean(busy)}
                onChange={(value) => {
                  if (value) setOwnership(value as BalanceOwnership);
                  clearResult();
                }}
              />
            )}
            {kind === 'warehouses' ? (
              <Select
                label="Bodega"
                placeholder="Todas las bodegas"
                searchable
                clearable
                data={options.warehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: `${warehouse.name}${!warehouse.active ? ' (inactiva)' : ''}`,
                }))}
                value={warehouseId}
                disabled={Boolean(busy) || loadingOptions}
                onChange={(value) => {
                  setWarehouseId(value);
                  clearResult();
                }}
              />
            ) : null}
          </SimpleGrid>
          <Text size="sm" c="dimmed">
            Saldos actuales de inventario, separados por referencia y
            propietario.
          </Text>
          <Group gap="sm" justify="flex-end">
            <Button
              variant="default"
              leftSection={<IconEye size={17} />}
              disabled={
                loadingOptions || Boolean(optionsError) || busy === 'download'
              }
              loading={busy === 'preview'}
              onClick={() => void generate(false)}
            >
              Vista previa
            </Button>
            <Button
              color="green"
              leftSection={<IconFileSpreadsheet size={17} />}
              disabled={
                loadingOptions || Boolean(optionsError) || busy === 'preview'
              }
              loading={busy === 'download'}
              onClick={() => void generate(true)}
            >
              Exportar Excel
            </Button>
          </Group>
        </Stack>
      </Paper>
      {optionsError ? (
        <Alert
          color="red"
          title="No se pudieron cargar los filtros"
          role="alert"
        >
          {optionsError}
          <Button
            variant="subtle"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </Button>
        </Alert>
      ) : null}
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {result ? (
        <Stack gap="sm" aria-live="polite">
          <Group justify="space-between">
            <Text fw={600}>{result.rowCount} registros</Text>
            <Text size="xs" c="dimmed">
              {new Date(result.queriedAt).toLocaleString('es-CO', {
                timeZone: 'America/Bogota',
              })}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {result.scope}
          </Text>
          {result.warnings.map((warning) => (
            <Alert key={warning} color="orange">
              {warning}
            </Alert>
          ))}
          {result.rows.length ? (
            <>
              <Stack hiddenFrom="sm" gap="sm">
                {result.rows.slice(0, 12).map((row, index) => (
                  <Box
                    key={`${row.itemKey}-${row.locationId}-${row.ownerWarehouseId}-${index}`}
                    pb="sm"
                    style={{
                      borderBottom:
                        '1px solid var(--mantine-color-default-border)',
                    }}
                  >
                    <Group
                      wrap="nowrap"
                      justify="space-between"
                      align="flex-start"
                      gap="sm"
                    >
                      <Text size="sm" fw={600}>
                        {balanceItemLabel(row)}
                      </Text>
                      <Text fw={700} style={{ whiteSpace: 'nowrap' }}>
                        {row.quantity.toLocaleString('es-CO')}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {row.ownerName}
                    </Text>
                    {row.customerName ? (
                      <Text size="xs">
                        {row.customerName} · {row.worksiteName}
                        {row.worksiteAlias ? ` · ${row.worksiteAlias}` : ''}
                      </Text>
                    ) : null}
                    <Text size="xs" c="dimmed">
                      {balanceLocationLabels[row.locationType]} ·{' '}
                      {row.locationName}
                    </Text>
                  </Box>
                ))}
              </Stack>
              <Table.ScrollContainer visibleFrom="sm" minWidth={760}>
                <Table
                  striped
                  highlightOnHover
                  withTableBorder
                  horizontalSpacing="sm"
                  verticalSpacing="sm"
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Cliente / obra</Table.Th>
                      <Table.Th>Referencia / equipo</Table.Th>
                      <Table.Th>Propietario</Table.Th>
                      <Table.Th>Ubicación</Table.Th>
                      <Table.Th ta="right">Saldo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.slice(0, 12).map((row, index) => (
                      <Table.Tr
                        key={`${row.itemKey}-${row.locationId}-${row.ownerWarehouseId}-${index}`}
                      >
                        <Table.Td>
                          <Text size="sm">{row.customerName || '—'}</Text>
                          <Text size="xs" c="dimmed">
                            {row.worksiteName}
                            {row.worksiteAlias ? ` · ${row.worksiteAlias}` : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td>{balanceItemLabel(row)}</Table.Td>
                        <Table.Td>{row.ownerName}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{row.locationName}</Text>
                          <Text size="xs" c="dimmed">
                            {balanceLocationLabels[row.locationType]}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          {row.quantity.toLocaleString('es-CO')}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          ) : (
            <Text>Sin saldos para los filtros seleccionados.</Text>
          )}
          {result.rowCount > 12 ? (
            <Text size="xs" c="dimmed">
              Vista previa de 12 de {result.rowCount} registros. El Excel
              incluye todos.
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
