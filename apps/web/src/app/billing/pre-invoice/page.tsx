'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconCalendarStats,
  IconChecklist,
  IconFileInvoice,
  IconMapPin,
  IconReceipt2,
  IconReportMoney,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import { api, ApiError } from '@/lib/api';

type WorksiteRow = {
  id: string;
  alias: string | null;
  active: boolean;
  customer: {
    id: string;
    name: string;
    active: boolean;
  };
  worksite: {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
  };
};

type PreInvoiceLine = {
  documentId: string;
  documentConsecutive: string | null;
  documentItemId: string;
  skuName: string;
  assetId: string | null;
  publicCode: string | null;
  internalNumber: number | null;
  serialOrEngine: string | null;
  description: string | null;
  requestedTag: string | null;
  from: string;
  to: string;
  deliveredAt: string;
  returnedAt: string | null;
  billingCutoffDate: string | null;
  billingStatus: 'OPEN' | 'CUT' | 'CLOSED' | string;
  billingNote: string | null;
  quantity: number;
  days: number;
  chargeType: 'DAY' | 'HOUR' | string;
  billableUnits: number;
  unitPrice: number;
  subtotal: number;
  iva: number;
  total: number;
};

type PreInvoiceResponse = {
  customerWorksite: {
    id: string;
    alias: string | null;
    customer: { id: string; name: string; nitOrId: string | null };
    worksite: { id: string; name: string; address: string | null };
  };
  period: {
    from: string | null;
    to: string;
  };
  ivaRate: number;
  totals: {
    subtotal: number;
    iva: number;
    total: number;
  };
  lines: PreInvoiceLine[];
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthKey() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function billingStatusLabel(value: string) {
  if (value === 'OPEN') return 'Open';
  if (value === 'CUT') return 'Cut';
  if (value === 'CLOSED') return 'Closed';
  return value;
}

function billingStatusColor(value: string) {
  if (value === 'OPEN') return 'green';
  if (value === 'CUT') return 'yellow';
  if (value === 'CLOSED') return 'gray';
  return 'blue';
}

export default function PreInvoicePage() {
  const [worksites, setWorksites] = useState<WorksiteRow[]>([]);
  const [customerWorksiteId, setCustomerWorksiteId] = useState<string | null>(null);
  const [from, setFrom] = useState(firstDayOfMonthKey());
  const [to, setTo] = useState(todayKey());
  const [ivaPercent, setIvaPercent] = useState<number | string>(19);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preInvoice, setPreInvoice] = useState<PreInvoiceResponse | null>(null);

  const worksiteOptions = useMemo(
    () =>
      worksites.map((row) => ({
        value: row.id,
        label: `${row.customer.name} / ${row.alias || row.worksite.name}`,
      })),
    [worksites],
  );

  const selectedWorksite = useMemo(
    () => worksites.find((row) => row.id === customerWorksiteId) ?? null,
    [customerWorksiteId, worksites],
  );

  useEffect(() => {
    let mounted = true;
    const loadWorksites = async () => {
      setBootLoading(true);
      setError(null);
      try {
        const data = await api<WorksiteRow[]>('/worksites', { method: 'GET' });
        if (!mounted) return;
        setWorksites(data);
        setCustomerWorksiteId((current) => current ?? data[0]?.id ?? null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'Error loading worksites');
      } finally {
        if (mounted) setBootLoading(false);
      }
    };
    loadWorksites();
    return () => {
      mounted = false;
    };
  }, []);

  const loadPreInvoice = async () => {
    if (!customerWorksiteId) {
      setError('Select a worksite');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ivaRate = (Number(ivaPercent) || 0) / 100;
      const params = new URLSearchParams({
        customerWorksiteId,
        to,
        ivaRate: String(ivaRate),
      });
      if (from) params.set('from', from);
      const data = await api<PreInvoiceResponse>(`/billing/prefactura?${params.toString()}`, {
        method: 'GET',
      });
      setPreInvoice(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error generating pre-invoice');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bootLoading && customerWorksiteId) {
      loadPreInvoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootLoading, customerWorksiteId]);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Annex / Pre-invoice"
          description="Consolidate rented equipment by worksite and period to review values before invoicing."
          icon={<IconFileInvoice size={20} />}
          iconColor="teal"
          accentColor="rgba(16,185,129,0.12)"
          aside={
            <Button onClick={loadPreInvoice} loading={loading || bootLoading}>
              Generate pre-invoice
            </Button>
          }
        />

        {error ? (
          <Alert color="red" variant="light" title="Could not generate the pre-invoice">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <Stack gap="md">
            <div>
              <Text fw={700}>1. Select the worksite and period</Text>
              <Text size="sm" c="dimmed">
                The worksite defines the billable universe. Then adjust dates and VAT to regenerate the annex.
              </Text>
            </div>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Select
                label="Customer / worksite"
                placeholder="Select"
                searchable
                data={worksiteOptions}
                value={customerWorksiteId}
                onChange={setCustomerWorksiteId}
                disabled={bootLoading}
              />
              <Paper radius="md" p="sm" bg="gray.0">
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <ThemeIcon color="cyan" variant="light" radius="xl" size={32}>
                    <IconMapPin size={16} />
                  </ThemeIcon>
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Selected worksite
                    </Text>
                    <Text size="sm" fw={600} mt={6}>
                      {selectedWorksite
                        ? selectedWorksite.alias || selectedWorksite.worksite.name
                        : 'No selection'}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {selectedWorksite
                        ? `${selectedWorksite.customer.name}${selectedWorksite.worksite.address ? ` · ${selectedWorksite.worksite.address}` : ''}`
                        : 'Select a worksite to enable calculation'}
                    </Text>
                  </div>
                </Group>
              </Paper>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <TextInput
                label="From"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.currentTarget.value)}
              />
              <TextInput
                label="To"
                type="date"
                value={to}
                onChange={(event) => setTo(event.currentTarget.value)}
              />
              <NumberInput
                label="IVA %"
                min={0}
                max={100}
                decimalScale={2}
                value={ivaPercent}
                onChange={setIvaPercent}
              />
            </SimpleGrid>
          </Stack>
        </Paper>

        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
          <StatCard
            label="Worksites"
            value={String(worksites.length)}
            hint="Available to query"
            color="teal"
            icon={<IconChecklist size={20} />}
          />
          <StatCard
            label="Period"
            value={from && to ? `${formatDate(from)} - ${formatDate(to)}` : '-'}
            hint="Current range"
            color="blue"
            icon={<IconCalendarStats size={20} />}
          />
          <StatCard
            label="IVA"
            value={`${Number(ivaPercent) || 0}%`}
            hint="Rate applied to the calculation"
            color="grape"
            icon={<IconReceipt2 size={20} />}
          />
          <StatCard
            label="Active worksite"
            value={selectedWorksite ? (selectedWorksite.alias || selectedWorksite.worksite.name) : '-'}
            hint={selectedWorksite ? selectedWorksite.customer.name : 'Select a worksite'}
            color="cyan"
            icon={<IconMapPin size={20} />}
          />
        </SimpleGrid>

        {preInvoice ? (
          <>
            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Title order={3}>{preInvoice.customerWorksite.customer.name}</Title>
                  <Text fw={600}>
                    {preInvoice.customerWorksite.alias || preInvoice.customerWorksite.worksite.name}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {formatDate(preInvoice.period.from)} - {formatDate(preInvoice.period.to)}
                  </Text>
                  {preInvoice.customerWorksite.worksite.address ? (
                    <Text c="dimmed" size="sm">
                      {preInvoice.customerWorksite.worksite.address}
                    </Text>
                  ) : null}
                </div>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" maw={640} flex={1}>
                  <Paper radius="md" p="sm" bg="gray.0">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Subtotal
                    </Text>
                    <Text fw={700} mt={8}>
                      {formatMoney(preInvoice.totals.subtotal)}
                    </Text>
                  </Paper>
                  <Paper radius="md" p="sm" bg="gray.0">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      IVA
                    </Text>
                    <Text fw={700} mt={8}>
                      {formatMoney(preInvoice.totals.iva)}
                    </Text>
                  </Paper>
                  <Paper radius="md" p="sm" bg="teal.0">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Total
                    </Text>
                    <Text fw={800} mt={8}>
                      {formatMoney(preInvoice.totals.total)}
                    </Text>
                  </Paper>
                </SimpleGrid>
              </Group>
            </Paper>

            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <div>
                  <Text fw={700}>Detalle facturable</Text>
                  <Text size="sm" c="dimmed">
                    Line by line for equipment included in the selected period.
                  </Text>
                </div>

                <Table highlightOnHover verticalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Equipo</Table.Th>
                      <Table.Th>Dispatch</Table.Th>
                      <Table.Th>Period</Table.Th>
                      <Table.Th>Unidades</Table.Th>
                      <Table.Th>Precio</Table.Th>
                      <Table.Th>Subtotal</Table.Th>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preInvoice.lines.map((line) => (
                      <Table.Tr key={line.documentItemId}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={600}>{line.skuName}</Text>
                            <Text size="xs" c="dimmed">
                              {[line.publicCode, line.internalNumber ? `#${line.internalNumber}` : null, line.serialOrEngine]
                                .filter(Boolean)
                                .join(' | ') || line.requestedTag || '-'}
                            </Text>
                            {line.description ? (
                              <Text size="xs" c="dimmed">
                                {line.description}
                              </Text>
                            ) : null}
                          </Stack>
                        </Table.Td>
                        <Table.Td>{line.documentConsecutive ?? '-'}</Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm">
                              {formatDate(line.from)} - {formatDate(line.to)}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {line.days} days
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm">{line.billableUnits}</Text>
                            <Text size="xs" c="dimmed">
                              Cant: {line.quantity} · {line.chargeType}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>{formatMoney(line.unitPrice)}</Table.Td>
                        <Table.Td>{formatMoney(line.subtotal)}</Table.Td>
                        <Table.Td>{formatMoney(line.total)}</Table.Td>
                        <Table.Td>
                          <Badge color={billingStatusColor(line.billingStatus)} variant="light">
                            {billingStatusLabel(line.billingStatus)}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {!preInvoice.lines.length && (
                      <Table.Tr>
                        <Table.Td colSpan={8}>
                          <Text c="dimmed" ta="center" py="md">
                            No equipment to pre-invoice in this period.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Paper>
          </>
        ) : null}
      </Stack>
    </Container>
  );
}
