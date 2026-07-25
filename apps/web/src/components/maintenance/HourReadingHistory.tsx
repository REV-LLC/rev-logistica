'use client';

import { Badge, Paper, Stack, Table, Text } from '@mantine/core';
import type { MaintenanceReading } from '@/lib/maintenance-types';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
function formatHours(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(parsed)} h`
    : `${value} h`;
}

export default function HourReadingHistory({ readings }: { readings: MaintenanceReading[] }) {
  if (!readings.length) {
    return (
      <Paper withBorder radius="lg" p="lg" bg="gray.0">
        <Stack gap={4} align="center">
          <Text fw={700}>Sin reportes de horas</Text>
          <Text size="sm" c="dimmed" ta="center">
            La primera lectura aparecerá aquí después de registrarla.
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="lg" style={{ overflowX: 'auto' }}>
      <Table verticalSpacing="sm" miw={620}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fecha</Table.Th>
            <Table.Th>Lectura</Table.Th>
            <Table.Th>Nota</Table.Th>
            <Table.Th>Registrado por</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {readings.map((reading) => (
            <Table.Tr key={reading.id}>
              <Table.Td><Text size="sm">{formatDate(reading.recordedAt)}</Text></Table.Td>
              <Table.Td>
                <Badge color="blue" variant="light">{formatHours(reading.hours)}</Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={reading.note ? undefined : 'dimmed'}>
                  {reading.note || 'Sin nota'}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">{reading.recordedByUserId}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
