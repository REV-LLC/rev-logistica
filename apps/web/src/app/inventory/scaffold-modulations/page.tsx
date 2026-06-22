'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalculator,
  IconCertificate,
  IconCircleCheck,
  IconRulerMeasure,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api } from '@/lib/api';
import {
  calculateScaffold,
  scaffoldPieces,
  type ScaffoldPieceKey,
} from '@/lib/scaffold/modulation-engine';

type Warehouse = {
  id: string;
  name: string;
  active: boolean;
  type: 'OWN' | 'ALLY';
  ownerCompany?: { name: string } | null;
};

type InventoryResponse = {
  bulk: InventoryBulkItem[];
};

type InventoryBulkItem = {
  skuId: string;
  skuName: string | null;
  name?: string | null;
  category?: string | null;
  quantity: number;
  unitWeight?: number | string | null;
};

type MatchedInventory = {
  skuId?: string;
  skuName?: string | null;
  available: number;
  unitWeight: number | null;
};

const frontOptions = [
  0.7, 1.4, 2, 2.7, 3, 3.4, 4, 4.4, 4.7, 5, 5.4, 6, 6.4, 7, 7.4, 8, 8.4, 9, 10, 12, 15, 18, 21, 24,
].map((value) => ({ value: String(value), label: `${value.toFixed(2)} M` }));

const heightOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16].map((value) => ({
  value: String(value),
  label: `${value.toFixed(2)} M`,
}));

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function findInventoryMatch(key: ScaffoldPieceKey, inventory: InventoryBulkItem[]): MatchedInventory {
  const piece = scaffoldPieces[key];
  const aliases = [piece.label, ...piece.aliases].map(normalizeText);

  const match = inventory.find((item) => {
    const text = normalizeText(`${item.skuName ?? ''} ${item.name ?? ''} ${item.category ?? ''}`);
    return aliases.some((alias) => text.includes(alias));
  });

  if (!match) {
    return { available: 0, unitWeight: null };
  }

  const unitWeight =
    typeof match.unitWeight === 'number'
      ? match.unitWeight
      : typeof match.unitWeight === 'string'
        ? Number(match.unitWeight)
        : null;

  return {
    skuId: match.skuId,
    skuName: match.skuName,
    available: match.quantity,
    unitWeight: unitWeight != null && Number.isFinite(unitWeight) ? unitWeight : null,
  };
}

function formatMeters(value: number) {
  return `${value.toFixed(2)} M`;
}

function optionColor(fit: 'exact' | 'under' | 'over') {
  if (fit === 'exact') return 'green';
  if (fit === 'under') return 'yellow';
  return 'blue';
}

function hasProviderHorizontal(segments: number[]) {
  return segments.includes(2);
}

function formatModulationSegments(segments: number[]) {
  return segments.map((segment) => formatMeters(segment)).join(' + ');
}

function ScaffoldTopView({
  segments,
  widthSegments,
}: {
  segments: number[];
  widthSegments: number[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment, 0);
  const totalWidth = widthSegments.reduce((sum, segment) => sum + segment, 0);
  const left = 48;
  const right = 952;
  const top = 42;
  const bottom = 290;
  const usableWidth = right - left;
  const usableHeight = bottom - top;
  const positions = segments.reduce<number[]>(
    (acc, segment) => {
      const next = acc[acc.length - 1] + segment;
      return [...acc, next];
    },
    [0],
  );
  const widthPositions = widthSegments.reduce<number[]>(
    (acc, segment) => {
      const next = acc[acc.length - 1] + segment;
      return [...acc, next];
    },
    [0],
  );
  const xFor = (value: number) => left + (value / total) * usableWidth;
  const yFor = (value: number) => top + (value / totalWidth) * usableHeight;

  return (
    <Box style={{ overflowX: 'auto' }}>
      <svg viewBox="0 0 1000 340" width="100%" height="420" role="img" aria-label="Vista superior de la modulacion">
        <rect x="1" y="1" width="998" height="338" rx="12" fill="#f8fafc" stroke="#d9e2ec" />
        <text x="48" y="24" fill="#475569" fontSize="13" fontWeight="700">
          Vista superior: frente {formatMeters(total)} x ancho {formatMeters(totalWidth)}
        </text>

        {segments.map((segment, index) => {
          const x1 = xFor(positions[index]);
          const x2 = xFor(positions[index + 1]);
          const mid = (x1 + x2) / 2;
          return (
            <g key={`${segment}-${index}`}>
              {widthPositions.map((widthPosition, widthIndex) => (
                <line
                  key={`x-${index}-${widthIndex}`}
                  x1={x1}
                  y1={yFor(widthPosition)}
                  x2={x2}
                  y2={yFor(widthPosition)}
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ))}
              <rect x={mid - 42} y="28" width="84" height="24" rx="6" fill="#ffffff" stroke="#cbd5e1" />
              <text x={mid} y="45" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">
                {formatMeters(segment)}
              </text>
            </g>
          );
        })}

        {widthSegments.map((segment, index) => {
          const y1 = yFor(widthPositions[index]);
          const y2 = yFor(widthPositions[index + 1]);
          const mid = (y1 + y2) / 2;
          return (
            <g key={`width-${segment}-${index}`}>
              {positions.map((position, positionIndex) => (
                <line
                  key={`y-${index}-${positionIndex}`}
                  x1={xFor(position)}
                  y1={y1}
                  x2={xFor(position)}
                  y2={y2}
                  stroke="#0f766e"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}
              <rect x="6" y={mid - 12} width="76" height="24" rx="6" fill="#ffffff" stroke="#cbd5e1" />
              <text x="44" y={mid + 4} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">
                {formatMeters(segment)}
              </text>
            </g>
          );
        })}

        {positions.map((position, index) => {
          const x = xFor(position);
          return (
            <g key={`line-${index}`}>
              <line x1={x} y1={top} x2={x} y2={bottom} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 5" />
              <text x={x} y="322" textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">
                L{index + 1}
              </text>
            </g>
          );
        })}

        {positions.map((position, xIndex) =>
          widthPositions.map((widthPosition, yIndex) => (
            <circle
              key={`point-${xIndex}-${yIndex}`}
              cx={xFor(position)}
              cy={yFor(widthPosition)}
              r="7"
              fill="#14b8a6"
              stroke="#0f766e"
              strokeWidth="2"
            />
          )),
        )}
      </svg>
    </Box>
  );
}

export default function ScaffoldModulationsPage() {
  const [targetLength, setTargetLength] = useState(8.4);
  const [width, setWidth] = useState(0.7);
  const [height, setHeight] = useState(2);
  const [spaceLimited, setSpaceLimited] = useState(true);
  const [supportMode, setSupportMode] = useState<'leveling-jack' | 'wheel'>('leveling-jack');
  const [selectedSegmentsKey, setSelectedSegmentsKey] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventory, setInventory] = useState<InventoryBulkItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<Warehouse[]>('/warehouses', { method: 'GET' })
      .then((data) => {
        if (!mounted) return;
        const activeWarehouses = data.filter((warehouse) => warehouse.active);
        setWarehouses(activeWarehouses);
        setWarehouseId(activeWarehouses[0]?.id ?? null);
      })
      .catch(() => setWarehouses([]));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!warehouseId) {
      setInventory([]);
      return;
    }

    let mounted = true;
    setLoadingInventory(true);
    api<InventoryResponse>(`/inventory/warehouse/${warehouseId}`, { method: 'GET' })
      .then((data) => {
        if (!mounted) return;
        setInventory(data.bulk ?? []);
      })
      .catch(() => setInventory([]))
      .finally(() => {
        if (mounted) setLoadingInventory(false);
      });

    return () => {
      mounted = false;
    };
  }, [warehouseId]);

  const calculation = useMemo(
    () =>
      calculateScaffold({
        targetLength,
        width,
        height,
        spaceLimited,
        platformLevels: Math.max(1, Math.floor(height / 2)),
        supportMode,
        selectedSegments: selectedSegmentsKey?.split('+').map(Number),
      }),
    [height, selectedSegmentsKey, spaceLimited, supportMode, targetLength, width],
  );

  useEffect(() => {
    setSelectedSegmentsKey(null);
  }, [height, spaceLimited, targetLength, width]);

  const materialRows = useMemo(() => {
    return calculation.pieces.map((piece) => {
      const matched = findInventoryMatch(piece.key, inventory);
      const missing = Math.max(0, piece.quantity - matched.available);
      const totalWeight = matched.unitWeight == null ? null : piece.quantity * matched.unitWeight;

      return {
        ...piece,
        ...matched,
        missing,
        totalWeight,
      };
    });
  }, [calculation.pieces, inventory]);

  const totalWeight = materialRows.reduce((sum, row) => sum + (row.totalWeight ?? 0), 0);
  const missingReferences = materialRows.filter((row) => row.missing > 0).length;
  const unknownWeights = materialRows.filter((row) => row.unitWeight == null).length;

  return (
    <main>
      <Container fluid py="xl">
        <Stack gap="lg">
              <PageHeaderCard
                title="Certified scaffold modulations"
                description="Initial engine with your logic: modulates length, calculates bays, required pieces, shortages, and inventory weight."
                icon={<IconCertificate size={22} />}
                iconColor="teal"
                accentColor="rgba(20, 184, 166, 0.18)"
                aside={
                  <Badge color={missingReferences ? 'red' : 'green'} variant="light" radius="sm" size="lg">
                    {missingReferences ? `${missingReferences} missing` : 'Complete'}
                  </Badge>
                }
              />

              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                <Paper withBorder radius="lg" p="lg">
                  <Stack gap="md">
                    <Group gap="xs">
                      <ThemeIcon color="teal" variant="light" radius="xl">
                        <IconRulerMeasure size={18} />
                      </ThemeIcon>
                      <Title order={3}>Input</Title>
                    </Group>

                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                      <Select
                        label="Front"
                        data={frontOptions}
                        value={String(targetLength)}
                        onChange={(value) => setTargetLength(Number(value ?? 0.7))}
                        allowDeselect={false}
                        searchable
                      />
                      <Select
                        label="Width"
                        data={frontOptions}
                        value={String(width)}
                        onChange={(value) => setWidth(Number(value ?? 0.7))}
                        allowDeselect={false}
                        searchable
                      />
                      <Select
                        label="Height"
                        data={heightOptions}
                        value={String(height)}
                        onChange={(value) => setHeight(Number(value ?? 2))}
                        allowDeselect={false}
                      />
                    </SimpleGrid>
                    <Switch
                      checked={spaceLimited}
                      onChange={(event) => setSpaceLimited(event.currentTarget.checked)}
                      label="Limited space: do not exceed the measurement"
                    />
                    <SegmentedControl
                      value={supportMode}
                      onChange={(value) => setSupportMode(value as 'leveling-jack' | 'wheel')}
                      data={[
                        { value: 'leveling-jack', label: 'Leveling jacks' },
                        { value: 'wheel', label: 'Wheels' },
                      ]}
                    />
                  </Stack>
                </Paper>

                <Paper withBorder radius="lg" p="lg">
                  <Stack gap="md">
                    <Title order={3}>Inventario y peso</Title>
                    <Select
                      label="Bodega"
                      data={warehouses.map((warehouse) => ({
                        value: warehouse.id,
                        label: `${warehouse.name}${warehouse.ownerCompany?.name ? ` | ${warehouse.ownerCompany.name}` : ''}`,
                      }))}
                      value={warehouseId}
                      onChange={setWarehouseId}
                      placeholder="Seleccionar bodega"
                      searchable
                    />
                    <SimpleGrid cols={2} spacing="sm">
                      <Paper withBorder radius="md" p="sm">
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          Peso total
                        </Text>
                        <Text fw={900} size="xl">
                          {totalWeight.toFixed(1)} kg
                        </Text>
                      </Paper>
                      <Paper withBorder radius="md" p="sm">
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          Modulos
                        </Text>
                        <Text fw={900} size="xl">
                          {calculation.metrics.bays * calculation.metrics.heightBodies}
                        </Text>
                      </Paper>
                    </SimpleGrid>
                    {unknownWeights > 0 ? (
                      <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                        {unknownWeights} referencias no tienen peso o no fueron cruzadas con inventario.
                      </Alert>
                    ) : null}
                    {loadingInventory ? <Text size="sm" c="dimmed">Cargando inventario...</Text> : null}
                  </Stack>
                </Paper>
              </SimpleGrid>

              {calculation.warnings.length > 0 ? (
                <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                  <Stack gap={4}>
                    {[...new Set(calculation.warnings)].map((warning, index) => (
                      <Text key={`${warning}-${index}`} size="sm">
                        {warning}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              ) : null}

              <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Vertical grid
                  </Text>
                  <Text fw={900} size="xl">
                    {calculation.metrics.verticalLines} x {calculation.metrics.widthLines}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {calculation.metrics.supportPoints} support points
                  </Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Height bodies
                  </Text>
                  <Text fw={900} size="xl">{calculation.metrics.heightBodies}</Text>
                  <Text size="sm" c="dimmed">2.00 M bodies</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Horizontal levels
                  </Text>
                  <Text fw={900} size="xl">{calculation.metrics.horizontalLevels}</Text>
                  <Text size="sm" c="dimmed">Includes 0.00 level</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Footprint
                  </Text>
                  <Text fw={900} size="xl">{calculation.metrics.footprintArea.toFixed(1)} m²</Text>
                  <Text size="sm" c="dimmed">
                    {formatMeters(calculation.metrics.totalLength)} x {formatMeters(calculation.recommendedWidth.total)}
                  </Text>
                </Paper>
              </SimpleGrid>

              <Paper withBorder radius="lg" p="lg">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <div>
                      <Title order={3}>Top view</Title>
                      <Text size="sm" c="dimmed">
                        Green points: verticals/supports. Blue lines: horizontals by front span.
                      </Text>
                    </div>
                    <Badge color="teal" variant="light" size="lg">
                      {calculation.metrics.verticalLines} x {calculation.metrics.widthLines} = {calculation.metrics.supportPoints} points
                    </Badge>
                  </Group>
                  <ScaffoldTopView
                    segments={calculation.recommended.segments}
                    widthSegments={calculation.recommendedWidth.segments}
                  />
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="lg">
                <Stack gap="md">
                  <Group gap="xs">
                    <ThemeIcon color="blue" variant="light" radius="xl">
                      <IconCalculator size={18} />
                    </ThemeIcon>
                    <div>
                      <Title order={3}>Modulation</Title>
                      <Text size="sm" c="dimmed">
                        Options generated with available horizontals and the space rule.
                      </Text>
                    </div>
                  </Group>

                  <Box className="scaffold-modulation-grid">
                    <Paper withBorder radius="md" p="md" bg="green.0">
                      <Stack gap={4}>
                        <Text size="xs" fw={700} tt="uppercase" c="green.8">
                          Recommended
                        </Text>
                        <Text fw={900} size="xl">
                          {formatModulationSegments(calculation.recommended.segments)}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Total {formatMeters(calculation.recommended.total)} | difference{' '}
                          {formatMeters(calculation.recommended.delta)}
                        </Text>
                      </Stack>
                    </Paper>

                    <Stack gap="xs">
                      {calculation.options.slice(0, 5).map((option) => (
                        <Paper key={option.segments.join('-')} withBorder radius="md" p="sm">
                          <Group justify="space-between" align="center" wrap="wrap">
                            <Checkbox
                              checked={calculation.recommended.segments.join('+') === option.segments.join('+')}
                              onChange={() => setSelectedSegmentsKey(option.segments.join('+'))}
                              label={
                                <Stack gap={2}>
                                  <Text size="sm" fw={700}>
                                    Modulation: {formatModulationSegments(option.segments)}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    Built length {formatMeters(option.total)} for front of {formatMeters(targetLength)}
                                  </Text>
                                </Stack>
                              }
                            />
                            <Badge color={optionColor(option.fit)} variant="light">
                              {option.fit === 'exact'
                                ? 'Exact'
                                : option.fit === 'under'
                                  ? `${formatMeters(Math.abs(option.delta))} under`
                                  : `${formatMeters(option.delta)} over`}
                            </Badge>
                            {hasProviderHorizontal(option.segments) ? (
                              <Badge color="orange" variant="light">
                                Provider
                              </Badge>
                            ) : null}
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="lg">
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <div>
                      <Title order={3}>Bill of materials</Title>
                      <Text size="sm" c="dimmed">
                        Required by modulation, available in warehouse, missing quantity, and SKU-based weight.
                      </Text>
                    </div>
                    <Button variant="light" color="teal" leftSection={<IconCircleCheck size={16} />}>
                      Use for dispatch
                    </Button>
                  </Group>

                  <Table.ScrollContainer minWidth={860}>
                    <Table verticalSpacing="sm">
                      <TableThead>
                        <TableTr>
                          <TableTh>Piece</TableTh>
                          <TableTh>Matched SKU</TableTh>
                          <TableTh ta="right">Req.</TableTh>
                          <TableTh ta="right">Avail.</TableTh>
                          <TableTh ta="right">Missing</TableTh>
                          <TableTh ta="right">Unit weight</TableTh>
                          <TableTh ta="right">Total weight</TableTh>
                          <TableTh>Estado</TableTh>
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        {materialRows.map((row) => (
                          <TableTr key={row.key}>
                            <TableTd>
                              <Text fw={700}>{row.label}</Text>
                              {row.note ? <Text size="xs" c="orange.8">{row.note}</Text> : null}
                            </TableTd>
                            <TableTd>
                              <Text size="sm" c={row.skuName ? undefined : 'dimmed'}>
                                {row.skuName ?? 'No match'}
                              </Text>
                            </TableTd>
                            <TableTd ta="right">{row.quantity}</TableTd>
                            <TableTd ta="right">{row.available}</TableTd>
                            <TableTd ta="right">
                              <Text fw={800} c={row.missing ? 'red.7' : 'green.7'}>
                                {row.missing}
                              </Text>
                            </TableTd>
                            <TableTd ta="right">{row.unitWeight == null ? '-' : `${row.unitWeight.toFixed(2)} kg`}</TableTd>
                            <TableTd ta="right">{row.totalWeight == null ? '-' : `${row.totalWeight.toFixed(1)} kg`}</TableTd>
                            <TableTd>
                              <Badge
                                color={row.missing ? 'red' : row.severity === 'warning' ? 'orange' : 'green'}
                                variant="light"
                              >
                                {row.missing ? 'Missing' : row.severity === 'warning' ? 'Viable, not ideal' : 'OK'}
                              </Badge>
                            </TableTd>
                          </TableTr>
                        ))}
                      </TableTbody>
                    </Table>
                  </Table.ScrollContainer>
                </Stack>
              </Paper>
        </Stack>
      </Container>
    </main>
  );
}
