'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconGauge } from '@tabler/icons-react';
import EquipmentSelect from '@/components/equipment/EquipmentSelect';
import { equipmentName, type EquipmentIdentity } from '@/components/equipment/types';
import MaintenancePanel from '@/components/maintenance/MaintenancePanel';
import { api } from '@/lib/api';
import { apiErrorMessage, type MaintenanceSubject } from '@/lib/maintenance-types';

type SubjectOption = MaintenanceSubject & { equipment?: EquipmentIdentity };

export default function MaintenancePage() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<SubjectOption[]>('/maintenance/subjects')
      .then((data) => { if (!cancelled) setSubjects(data); })
      .catch((err) => { if (!cancelled) setError(apiErrorMessage(err, 'No se pudieron cargar los equipos y vehículos.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  const subject = subjects.find((entry) => `${entry.type}:${entry.id}` === selected);
  const options: EquipmentIdentity[] = subjects.map((entry) => ({
    ...(entry.equipment ?? {
      publicCode: entry.label,
      internalNumber: 0,
      displayName: entry.label,
      sku: { name: entry.label },
      warehouseOwner: { name: entry.type === 'VEHICLE' ? 'Vehículo' : 'Equipo' },
    }),
    id: `${entry.type}:${entry.id}`,
  }));

  return (
    <Container size="xl" py="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <div><Title order={2}>Mantenimientos</Title><Text c="dimmed" size="sm">Consulta el último trabajo, registra el siguiente y programa sus alertas.</Text></div>
          <Button component={Link} href="/inventory/hour-meter" variant="light" leftSection={<IconGauge size={18} />}>Horómetros</Button>
        </Group>
        {error ? <Alert color="red" title="No se pudo cargar"><Stack gap="xs"><Text size="sm">{error}</Text><Button variant="light" color="red" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></Stack></Alert> : null}
        <EquipmentSelect label="Equipo o vehículo" placeholder="Buscar por equipo, código, serie o placa" items={options} value={selected} onChange={setSelected} disabled={loading} loading={loading} />
        {subject ? <MaintenancePanel key={`${subject.type}:${subject.id}`} subject={{ ...subject, label: subject.equipment ? equipmentName(subject.equipment) : subject.label }} /> : !loading && !error ? <Paper withBorder p="xl" radius="lg"><Text ta="center" c="dimmed">{subjects.length ? 'Selecciona un equipo o vehículo para consultar y registrar sus mantenimientos.' : 'No hay equipos propios ni vehículos activos disponibles.'}</Text></Paper> : null}
      </Stack>
    </Container>
  );
}
