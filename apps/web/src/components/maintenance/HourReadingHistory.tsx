'use client';

import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Group, Modal, Paper, Stack, Table, Text } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { apiBlob, ApiError } from '@/lib/api';
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

function recordedByLabel(reading: MaintenanceReading) {
  const employeeName = [
    reading.recordedBy?.employee?.name,
    reading.recordedBy?.employee?.lastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return employeeName || reading.recordedBy?.email || 'Usuario no disponible';
}

function EvidenceAction({
  reading,
  loading,
  onOpen,
}: {
  reading: MaintenanceReading;
  loading: boolean;
  onOpen: (reading: MaintenanceReading) => void;
}) {
  if (!reading.evidenceFileObjectId) {
    return <Text size="sm" c="dimmed">Sin evidencia</Text>;
  }

  return (
    <ActionIcon
      variant="light"
      color="blue"
      aria-label={`Ver evidencia de ${formatDate(reading.recordedAt)}`}
      loading={loading}
      onClick={() => onOpen(reading)}
    >
      <IconPhoto size={17} />
    </ActionIcon>
  );
}

export default function HourReadingHistory({ readings }: { readings: MaintenanceReading[] }) {
  const [evidence, setEvidence] = useState<{ reading: MaintenanceReading; url: string } | null>(null);
  const [loadingEvidenceId, setLoadingEvidenceId] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    const evidenceUrl = evidence?.url;
    return () => {
      if (evidenceUrl) URL.revokeObjectURL(evidenceUrl);
    };
  }, [evidence?.url]);

  const openEvidence = async (reading: MaintenanceReading) => {
    if (!reading.evidenceFileObjectId) return;
    setLoadingEvidenceId(reading.id);
    setEvidenceError(null);
    try {
      const blob = await apiBlob(`/files/${reading.evidenceFileObjectId}/download`, {
        redirectOnAuthError: false,
      });
      setEvidence({ reading, url: URL.createObjectURL(blob) });
    } catch (error) {
      setEvidenceError(
        error instanceof ApiError
          ? `${error.status}: ${error.message}`
          : 'No se pudo abrir la evidencia',
      );
    } finally {
      setLoadingEvidenceId(null);
    }
  };

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
    <Stack gap="sm">
      {evidenceError ? <Alert color="red">{evidenceError}</Alert> : null}
      <Paper withBorder radius="lg" visibleFrom="sm" style={{ overflowX: 'auto' }}>
        <Table verticalSpacing="sm" miw={720}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Lectura</Table.Th>
              <Table.Th>Nota</Table.Th>
              <Table.Th>Registrado por</Table.Th>
              <Table.Th>Evidencia</Table.Th>
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
                  <Text size="sm" fw={600}>{recordedByLabel(reading)}</Text>
                </Table.Td>
                <Table.Td>
                  <EvidenceAction
                    reading={reading}
                    loading={loadingEvidenceId === reading.id}
                    onOpen={openEvidence}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Stack hiddenFrom="sm" gap="xs">
        {readings.map((reading) => (
          <Paper key={reading.id} withBorder radius="md" p="sm">
            <Stack gap="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text size="sm" fw={600}>{formatDate(reading.recordedAt)}</Text>
                <Badge color="blue" variant="light">{formatHours(reading.hours)}</Badge>
              </Group>
              <Text size="sm" c={reading.note ? undefined : 'dimmed'}>
                {reading.note || 'Sin nota'}
              </Text>
              <Group justify="space-between" align="center" gap="xs">
                <div style={{ minWidth: 0 }}>
                  <Text size="xs" c="dimmed">Registrado por</Text>
                  <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {recordedByLabel(reading)}
                  </Text>
                </div>
                <EvidenceAction
                  reading={reading}
                  loading={loadingEvidenceId === reading.id}
                  onOpen={openEvidence}
                />
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Modal
        opened={!!evidence}
        onClose={() => setEvidence(null)}
        title={evidence ? `Evidencia · ${formatHours(evidence.reading.hours)}` : 'Evidencia'}
        size="lg"
        centered
      >
        {evidence ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={evidence.url}
            alt={`Evidencia del horómetro en ${formatHours(evidence.reading.hours)}`}
            style={{
              display: 'block',
              width: '100%',
              maxHeight: '75vh',
              objectFit: 'contain',
            }}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}
