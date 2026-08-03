'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconFileDollar,
  IconListSearch,
  IconPlus,
  IconPrinter,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import TableRowActions from '@/components/TableRowActions';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import { api, ApiError } from '@/lib/api';

type ControlType = 'BULK' | 'SERIAL';

type PriceListSku = {
  id: string;
  name: string;
  price: number | string | null;
  subrentalPrice: number | string | null;
  replacementValue: number | string | null;
  chargeType: 'DAY' | 'HOUR' | string;
  minimumChargeHours: number | string | null;
  active: boolean;
  assetFamily: {
    id: string;
    code: string;
    name: string;
    controlType: ControlType;
  };
  controlType: ControlType;
  category: string;
};

type Customer = {
  id: string;
  name: string;
  nitOrId: string | null;
  phone: string | null;
  active: boolean;
};

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

type QuoteLine = {
  id: string;
  skuId: string;
  code: string;
  name: string;
  category: string;
  controlType: ControlType;
  chargeType: string;
  quantity: number;
  period: number;
  unitPrice: number;
  discountPercent: number;
};

const moneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fromNumberInput(value: number | string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberState(value: number | string): number | '' {
  if (value === '') return '';
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : '';
}

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatChargeUnit(chargeType: string) {
  if (chargeType === 'HOUR') return 'hora';
  if (chargeType === 'DAY') return 'dia';
  return chargeType || 'unidad';
}

function makeLineId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lineSubtotal(line: QuoteLine) {
  return line.quantity * line.period * line.unitPrice;
}

function lineTotal(line: QuoteLine) {
  return lineSubtotal(line) * (1 - line.discountPercent / 100);
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function QuotationPage() {
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteDate, setQuoteDate] = useState('');
  const [validDays, setValidDays] = useState<number | ''>(15);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [worksites, setWorksites] = useState<WorksiteRow[]>([]);
  const [skus, setSkus] = useState<PriceListSku[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [worksiteId, setWorksiteId] = useState<string | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [lineQuantity, setLineQuantity] = useState<number | ''>(1);
  const [linePeriod, setLinePeriod] = useState<number | ''>(1);
  const [lineDiscount, setLineDiscount] = useState<number | ''>(0);
  const [transportCharge, setTransportCharge] = useState<number | ''>(0);
  const [extraCharge, setExtraCharge] = useState<number | ''>(0);
  const [includeVat, setIncludeVat] = useState(true);
  const [vatPercent, setVatPercent] = useState<number | ''>(19);
  const [description, setDescription] = useState('Concreto acelerado a 28 dias.');
  const [generalConditions, setGeneralConditions] = useState(
    'Tiempo de confirmacion de cotizacion: 1 dia\nCotizacion sujeta a disponibilidad de equipo.',
  );
  const [commercialConditions, setCommercialConditions] = useState(
    'Pago debe ser anticipado.\nDespues de confirmada la cotizacion se deben diligenciar documentos legales solicitados por la empresa para el alquiler del equipo.',
  );
  const [transportLabel, setTransportLabel] = useState('IDA Y REGRESO');
  const [transportQuantity, setTransportQuantity] = useState<number | ''>(2);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [customersData, worksitesData, skuData] = await Promise.all([
        api<Customer[]>('/customers', { method: 'GET' }),
        api<WorksiteRow[]>('/worksites', { method: 'GET' }),
        api<PriceListSku[]>('/skus', { method: 'GET' }),
      ]);
      setCustomers(customersData);
      setWorksites(worksitesData);
      setSkus(skuData);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo cargar la informacion de cotizacion.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setQuoteDate(formatDateInput(now));
    setQuoteNumber(`COT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`);
    loadData();
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId],
  );

  const filteredWorksites = useMemo(() => {
    if (!customerId) return worksites;
    return worksites.filter((row) => row.customer.id === customerId);
  }, [worksites, customerId]);

  const selectedWorksite = useMemo(
    () => worksites.find((row) => row.id === worksiteId) ?? null,
    [worksites, worksiteId],
  );

  const activeSkus = useMemo(() => skus.filter((sku) => sku.active), [skus]);

  const skuOptions = useMemo(
    () =>
      activeSkus.map((sku) => ({
        value: sku.id,
        label: `${sku.assetFamily.code} - ${sku.name}`,
      })),
    [activeSkus],
  );

  const customerOptions = useMemo(
    () =>
      customers
        .filter((customer) => customer.active)
        .map((customer) => ({
          value: customer.id,
          label: customer.nitOrId ? `${customer.name} - ${customer.nitOrId}` : customer.name,
        })),
    [customers],
  );

  const worksiteOptions = useMemo(
    () =>
      filteredWorksites
        .filter((row) => row.active && row.worksite.active)
        .map((row) => ({
          value: row.id,
          label: `${row.worksite.name}${row.alias ? ` - ${row.alias}` : ''}`,
        })),
    [filteredWorksites],
  );

  const selectedSku = useMemo(
    () => activeSkus.find((sku) => sku.id === selectedSkuId) ?? null,
    [activeSkus, selectedSkuId],
  );

  useEffect(() => {
    if (!selectedSku) return;

    const minimumPeriod = toNumber(selectedSku.minimumChargeHours);
    setLinePeriod(selectedSku.chargeType === 'HOUR' && minimumPeriod ? minimumPeriod : 1);
  }, [selectedSku]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
    const discount = lines.reduce((sum, line) => sum + (lineSubtotal(line) - lineTotal(line)), 0);
    const itemsTotal = subtotal - discount;
    const charges = fromNumberInput(transportCharge || 0) + fromNumberInput(extraCharge || 0);
    const taxableBase = itemsTotal + charges;
    const vat = includeVat ? taxableBase * (fromNumberInput(vatPercent || 0) / 100) : 0;

    return {
      subtotal,
      discount,
      itemsTotal,
      charges,
      vat,
      total: taxableBase + vat,
    };
  }, [extraCharge, includeVat, lines, transportCharge, vatPercent]);

  const addLine = () => {
    if (!selectedSku) {
      setError('Selecciona una referencia para agregar.');
      return;
    }

    const unitPrice = toNumber(selectedSku.price) ?? 0;
    const quantity = Math.max(1, fromNumberInput(lineQuantity || 0));
    const period = Math.max(1, fromNumberInput(linePeriod || 0));
    const discountPercent = Math.min(100, Math.max(0, fromNumberInput(lineDiscount || 0)));

    setLines((current) => [
      ...current,
      {
        id: makeLineId(),
        skuId: selectedSku.id,
        code: selectedSku.assetFamily.code,
        name: selectedSku.name,
        category: selectedSku.category,
        controlType: selectedSku.controlType,
        chargeType: selectedSku.chargeType,
        quantity,
        period,
        unitPrice,
        discountPercent,
      },
    ]);
    setSelectedSkuId(null);
    setLineQuantity(1);
    setLinePeriod(1);
    setLineDiscount(0);
    setError(null);
  };

  const updateLine = (
    lineId: string,
    patch: Partial<Pick<QuoteLine, 'quantity' | 'period' | 'unitPrice' | 'discountPercent'>>,
  ) => {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const clearQuote = () => {
    setLines([]);
    setTransportCharge(0);
    setExtraCharge(0);
    setIncludeVat(true);
    setDescription('Concreto acelerado a 28 dias.');
    setGeneralConditions('Tiempo de confirmacion de cotizacion: 1 dia\nCotizacion sujeta a disponibilidad de equipo.');
    setCommercialConditions('Pago debe ser anticipado.\nDespues de confirmada la cotizacion se deben diligenciar documentos legales solicitados por la empresa para el alquiler del equipo.');
    setTransportLabel('IDA Y REGRESO');
    setTransportQuantity(2);
  };

  const exportCsv = () => {
    const headers = ['Cotizacion', 'Cliente', 'Obra', 'Codigo', 'Referencia', 'Cantidad', 'Periodo', 'Unidad cobro', 'Precio unitario', 'Descuento %', 'Total'];
    const rows = lines.map((line) => [
      quoteNumber,
      selectedCustomer?.name ?? '',
      selectedWorksite?.worksite.name ?? '',
      line.code,
      line.name,
      line.quantity,
      line.period,
      formatChargeUnit(line.chargeType),
      line.unitPrice,
      line.discountPercent,
      lineTotal(line),
    ]);
    const summaryRows = [
      [],
      ['Subtotal', totals.subtotal],
      ['Descuento', totals.discount],
      ['Cargos', totals.charges],
      ['IVA', totals.vat],
      ['Total', totals.total],
    ];

    const csv = [headers, ...rows, ...summaryRows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quoteNumber || 'cotizacion'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const validUntil = useMemo(() => {
    if (!quoteDate) return '-';
    const date = new Date(`${quoteDate}T00:00:00`);
    date.setDate(date.getDate() + fromNumberInput(validDays || 0));
    return dateFormatter.format(date);
  }, [quoteDate, validDays]);
  const quoteDateLabel = useMemo(() => {
    if (!quoteDate) return '-';
    const date = new Date(`${quoteDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return quoteDate;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()}-${months[date.getMonth()]}`;
  }, [quoteDate]);
  const selectedProjectName = selectedWorksite?.worksite.name || selectedWorksite?.alias || '';
  const introCustomerName = selectedCustomer?.name || 'CLIENTE';
  const introProjectName = selectedProjectName || 'PROYECTO';
  const generalConditionLines = generalConditions.split('\n').map((line) => line.trim()).filter(Boolean);
  const commercialConditionLines = commercialConditions.split('\n').map((line) => line.trim()).filter(Boolean);
  const visibleRows = [...lines, ...Array.from({ length: Math.max(0, 11 - lines.length) }, (_, index) => ({
    id: `empty-${index}`,
    skuId: '',
    code: '',
    name: '',
    category: '',
    controlType: 'BULK' as ControlType,
    chargeType: 'DAY',
    quantity: 0,
    period: 0,
    unitPrice: 0,
    discountPercent: 0,
  }))];

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <div className="quotation-no-print">
          <PageHeaderCard
            title="Cotizacion"
            description="Arma una propuesta con clientes, obras y precios vigentes del catalogo."
            icon={<IconFileDollar size={20} />}
            iconColor="yellow"
            accentColor="rgba(217, 154, 24, 0.16)"
            aside={
              <Group gap="xs">
                <Button
                  variant="light"
                  color="gray"
                  leftSection={<IconRefresh size={16} />}
                  onClick={loadData}
                  loading={loading}
                >
                  Actualizar
                </Button>
                <Button
                  variant="light"
                  color="green"
                  leftSection={<IconDeviceFloppy size={16} />}
                  onClick={exportCsv}
                  disabled={!lines.length}
                >
                  CSV
                </Button>
                <Button
                  variant="filled"
                  color="yellow"
                  leftSection={<IconPrinter size={16} />}
                  onClick={() => window.print()}
                  disabled={!lines.length}
                >
                  Imprimir
                </Button>
              </Group>
            }
          >
            <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
              <TextInput
                label="Numero"
                value={quoteNumber}
                onChange={(event) => setQuoteNumber(event.currentTarget.value)}
              />
              <TextInput
                label="Fecha"
                type="date"
                value={quoteDate}
                onChange={(event) => setQuoteDate(event.currentTarget.value)}
              />
              <NumberInput
                label="Validez"
                min={0}
                suffix=" dias"
                value={validDays}
                onChange={(value) => setValidDays(toNumberState(value))}
              />
              <TextInput label="Vence" value={validUntil} readOnly />
            </SimpleGrid>
          </PageHeaderCard>
        </div>

        {error ? (
          <Alert color="red" variant="light" className="quotation-no-print">
            {error}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" className="quotation-no-print">
          <StatCard
            label="Lineas"
            value={lines.length}
            hint="Referencias agregadas"
            icon={<IconListSearch size={20} />}
            color="yellow"
          />
          <StatCard
            label="Subtotal"
            value={formatMoney(totals.itemsTotal)}
            hint="Despues de descuentos"
            icon={<IconFileDollar size={20} />}
            color="green"
          />
          <StatCard
            label="Total"
            value={formatMoney(totals.total)}
            hint={includeVat ? 'Con IVA' : 'Sin IVA'}
            icon={<IconDeviceFloppy size={20} />}
            color="blue"
          />
        </SimpleGrid>

        <Paper withBorder radius="md" p="md" className="quotation-no-print">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Select
                label="Cliente"
                placeholder="Seleccionar cliente"
                searchable
                clearable
                data={customerOptions}
                value={customerId}
                onChange={(value) => {
                  setCustomerId(value);
                  setWorksiteId(null);
                }}
                nothingFoundMessage="Sin clientes"
              />
              <Select
                label="Obra"
                placeholder="Seleccionar obra"
                searchable
                clearable
                data={worksiteOptions}
                value={worksiteId}
                onChange={setWorksiteId}
                nothingFoundMessage="Sin obras"
              />
            </SimpleGrid>

            <Divider />

            <SimpleGrid cols={{ base: 1, md: 5 }} spacing="md" verticalSpacing="sm">
              <Select
                label="Referencia"
                placeholder="Buscar item"
                searchable
                clearable
                data={skuOptions}
                value={selectedSkuId}
                onChange={setSelectedSkuId}
                nothingFoundMessage="Sin referencias"
                style={{ gridColumn: 'span 2' }}
              />
              <NumberInput
                label="Cantidad"
                min={1}
                value={lineQuantity}
                onChange={(value) => setLineQuantity(toNumberState(value))}
              />
              <NumberInput
                label={selectedSku?.chargeType === 'HOUR' ? 'Horas' : 'Dias'}
                min={1}
                value={linePeriod}
                onChange={(value) => setLinePeriod(toNumberState(value))}
              />
              <NumberInput
                label="Desc."
                min={0}
                max={100}
                suffix="%"
                value={lineDiscount}
                onChange={(value) => setLineDiscount(toNumberState(value))}
              />
            </SimpleGrid>

            <Group justify="space-between" align="center" wrap="wrap">
              <Text size="sm" c="dimmed">
                {selectedSku
                  ? `${selectedSku.category} | ${formatChargeUnit(selectedSku.chargeType)} | ${formatMoney(toNumber(selectedSku.price) ?? 0)}`
                  : 'Selecciona una referencia para tomar su precio vigente.'}
              </Text>
              <Button leftSection={<IconPlus size={16} />} onClick={addLine} disabled={!selectedSku}>
                Agregar
              </Button>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="md" className="quotation-no-print">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={700}>Lineas y condiciones</Text>
                <Text size="sm" c="dimmed">
                  Ajusta los valores que se imprimen en el formato de cotizacion.
                </Text>
              </div>
            </Group>

            <ScrollArea type="auto">
              <Table striped highlightOnHover withTableBorder withColumnBorders miw={860}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Referencia</Table.Th>
                    <Table.Th ta="right">Cantidad</Table.Th>
                    <Table.Th ta="right">Dias/Horas</Table.Th>
                    <Table.Th ta="right">Precio</Table.Th>
                    <Table.Th ta="right">Desc.</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                    <Table.Th ta="right">Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {lines.length ? (
                    lines.map((line) => (
                      <Table.Tr key={line.id}>
                        <Table.Td>
                          <Text fw={650}>{line.name}</Text>
                          <Text size="xs" c="dimmed">
                            {line.code} | {line.category}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <NumberInput
                            min={1}
                            value={line.quantity}
                            onChange={(value) => updateLine(line.id, { quantity: Math.max(1, fromNumberInput(value)) })}
                            w={92}
                          />
                        </Table.Td>
                        <Table.Td ta="right">
                          <NumberInput
                            min={1}
                            value={line.period}
                            onChange={(value) => updateLine(line.id, { period: Math.max(1, fromNumberInput(value)) })}
                            w={92}
                          />
                        </Table.Td>
                        <Table.Td ta="right">
                          <NumberInput
                            min={0}
                            thousandSeparator="."
                            decimalSeparator=","
                            value={line.unitPrice}
                            onChange={(value) => updateLine(line.id, { unitPrice: Math.max(0, fromNumberInput(value)) })}
                            w={136}
                          />
                        </Table.Td>
                        <Table.Td ta="right">
                          <NumberInput
                            min={0}
                            max={100}
                            suffix="%"
                            value={line.discountPercent}
                            onChange={(value) => updateLine(line.id, { discountPercent: Math.min(100, Math.max(0, fromNumberInput(value))) })}
                            w={96}
                          />
                        </Table.Td>
                        <Table.Td ta="right" fw={700}>
                          {formatMoney(lineTotal(line))}
                        </Table.Td>
                        <Table.Td>
                          <TableRowActions
                            actions={[
                              {
                                key: 'delete',
                                label: `Eliminar ${line.name}`,
                                icon: <IconTrash size={16} />,
                                color: 'red',
                                onClick: () => removeLine(line.id),
                              },
                            ]}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text c="dimmed" ta="center" py="lg">
                          Agrega referencias para construir la cotizacion.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap="sm">
                <NumberInput
                  label="Transporte"
                  min={0}
                  thousandSeparator="."
                  decimalSeparator=","
                  value={transportCharge}
                  onChange={(value) => setTransportCharge(toNumberState(value))}
                />
                <Group grow align="flex-end">
                  <TextInput
                    label="Detalle transporte"
                    value={transportLabel}
                    onChange={(event) => setTransportLabel(event.currentTarget.value)}
                  />
                  <NumberInput
                    label="Cantidad"
                    min={0}
                    value={transportQuantity}
                    onChange={(value) => setTransportQuantity(toNumberState(value))}
                  />
                </Group>
              </Stack>
              <Stack gap="sm">
                <NumberInput
                  label="Otros cargos"
                  min={0}
                  thousandSeparator="."
                  decimalSeparator=","
                  value={extraCharge}
                  onChange={(value) => setExtraCharge(toNumberState(value))}
                />
                <Group align="flex-end" wrap="nowrap">
                  <Checkbox
                    label="Incluir IVA"
                    checked={includeVat}
                    onChange={(event) => setIncludeVat(event.currentTarget.checked)}
                    style={{ flex: '1 1 auto' }}
                  />
                  <NumberInput
                    aria-label="Porcentaje de IVA"
                    min={0}
                    max={100}
                    suffix="%"
                    value={vatPercent}
                    onChange={(value) => setVatPercent(toNumberState(value))}
                    w={110}
                    disabled={!includeVat}
                  />
                </Group>
              </Stack>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Textarea
                label="Descripcion"
                minRows={4}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
              <Textarea
                label="Condiciones generales"
                minRows={4}
                value={generalConditions}
                onChange={(event) => setGeneralConditions(event.currentTarget.value)}
              />
              <Textarea
                label="Condiciones comerciales"
                minRows={4}
                value={commercialConditions}
                onChange={(event) => setCommercialConditions(event.currentTarget.value)}
              />
            </SimpleGrid>
          </Stack>
        </Paper>

        <Paper
          withBorder
          radius="xl"
          p={{ base: 'sm', md: 'lg' }}
          bg="gray.0"
          className="quotation-print-area"
        >
          <Group justify="space-between" align="flex-start" mb="md" className="quotation-no-print">
            <div>
              <Text fw={800}>Preview de cotizacion</Text>
              <Text size="sm" c="dimmed">
                Vista previa del formato que se imprime o se guarda como PDF.
              </Text>
            </div>
            <Badge color="yellow" variant="light">
              Hoja carta
            </Badge>
          </Group>
          <div className="quote-sheet">
            <div className="quote-top">
              <img src="/rev-logo-clean.svg" alt="REV" className="quote-logo" />
              <div className="quote-meta">
                <div className="quote-meta-label">COTIZACION</div>
                <div className="quote-meta-value">{quoteNumber || '-'}</div>
                <div className="quote-meta-label">FECHA</div>
                <div className="quote-meta-value">{quoteDateLabel}</div>
              </div>
            </div>

            <p className="quote-intro">
              Senores, <strong>{introCustomerName}</strong> En atencion de su solicitud para el proyecto{' '}
              <strong>{introProjectName}</strong>, Renta equipos del Valle se permite presentar una propuesta economica.
            </p>

            <table className="quote-main-table">
              <thead>
                <tr>
                  <th className="quote-equipment-col">EQUIPO</th>
                  <th>UNID</th>
                  <th>CANTIDAD</th>
                  <th>DIAS</th>
                  <th>HORAS</th>
                  <th>VALOR</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((line) => {
                  const isEmpty = !line.skuId;
                  return (
                    <tr key={line.id} className={isEmpty ? 'quote-empty-row' : undefined}>
                      <td>{isEmpty ? '' : line.name}</td>
                      <td>{isEmpty ? '' : formatChargeUnit(line.chargeType)}</td>
                      <td>{isEmpty ? '' : line.quantity}</td>
                      <td>{isEmpty || line.chargeType === 'HOUR' ? '' : line.period}</td>
                      <td>{isEmpty || line.chargeType !== 'HOUR' ? '' : line.period}</td>
                      <td className="quote-money-cell">{isEmpty ? '$' : `$ ${line.unitPrice.toLocaleString('en-US')}`}</td>
                      <td className="quote-money-cell">{isEmpty ? '-' : `$ ${lineTotal(line).toLocaleString('en-US')}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="quote-divider" />

            <table className="quote-transport-table">
              <thead>
                <tr>
                  <th>TRANSPORTE</th>
                  <th>ENTREGA</th>
                  <th>DEVOLUCION</th>
                  <th>CANT</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{transportLabel || '-'}</td>
                  <td />
                  <td />
                  <td>{transportQuantity || '-'}</td>
                  <td>{fromNumberInput(transportCharge || 0) > 0 ? `$ ${fromNumberInput(transportCharge || 0).toLocaleString('en-US')}` : '-'}</td>
                </tr>
              </tbody>
            </table>

            <div className="quote-lower-grid">
              <div className="quote-box quote-description-box">
                <h3>Descripcion</h3>
                {description ? <p>{description}</p> : null}
              </div>

              <table className="quote-totals-table">
                <tbody>
                  <tr>
                    <th>Valor Neto</th>
                    <td>$</td>
                    <td>{totals.itemsTotal.toLocaleString('en-US')}</td>
                  </tr>
                  <tr>
                    <th>IVA ({fromNumberInput(vatPercent || 0)}%)</th>
                    <td>$</td>
                    <td>{totals.vat.toLocaleString('en-US')}</td>
                  </tr>
                  <tr className="quote-spacer-row">
                    <th />
                    <td />
                    <td />
                  </tr>
                  <tr className="quote-grand-total">
                    <th>Total</th>
                    <td>$</td>
                    <td>{totals.total.toLocaleString('en-US')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="quote-box quote-conditions-box">
              <h3>Condiciones Generales</h3>
              <ul>
                {generalConditionLines.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </div>

            <div className="quote-box quote-conditions-box quote-commercial-box">
              <h3>Condiciones Comerciales</h3>
              <ul>
                {commercialConditionLines.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </div>

            <div className="quote-footer">
              <div>
                <strong>SAMUEL GUERRERO VIVEROS</strong>
              </div>
              <div className="quote-footer-contact">
                <div>SUB-GERENTE</div>
                <div>(318) 804 4607</div>
                <div>sg@revcontractorsllc.com</div>
              </div>
            </div>
          </div>
        </Paper>

        <Group justify="flex-end" className="quotation-no-print">
          <Button variant="subtle" color="red" onClick={clearQuote} disabled={!lines.length}>
            Limpiar cotizacion
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
