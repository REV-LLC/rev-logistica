'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Container, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { IconGauge } from '@tabler/icons-react';
import MaintenancePanel from '@/components/maintenance/MaintenancePanel';
import { api } from '@/lib/api';
import { apiErrorMessage, type MaintenanceSubject } from '@/lib/maintenance-types';

export default function MaintenancePage() {
  const [subjects, setSubjects] = useState<MaintenanceSubject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<MaintenanceSubject[]>('/maintenance/subjects')
      .then((data) => { if (!cancelled) setSubjects(data); })
      .catch((err) => { if (!cancelled) setError(apiErrorMessage(err, 'No se pudieron cargar los equipos y vehículos.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  const subject = subjects.find((entry) => `${entry.type}:${entry.id}` === selected);
  const options = (['ASSET', 'VEHICLE'] as const).map((type) => ({
    group: type === 'ASSET' ? 'Equipos propios' : 'Vehículos',
    items: subjects.filter((entry) => entry.type === type).map((entry) => ({ value: `${entry.type}:${entry.id}`, label: entry.label })),
  })).filter((group) => group.items.length);

  return (
    <Container size="xl" py="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <div><Title order={2}>Mantenimientos</Title><Text c="dimmed" size="sm">Consulta el último trabajo, registra el siguiente y programa sus alertas.</Text></div>
          <Button component={Link} href="/inventory/hour-meter" variant="light" leftSection={<IconGauge size={18} />}>Horómetros</Button>
        </Group>
        {error ? <Alert color="red" title="No se pudo cargar"><Stack gap="xs"><Text size="sm">{error}</Text><Button variant="light" color="red" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button></Stack></Alert> : null}
        <Select label="Equipo o vehículo" placeholder={loading ? 'Cargando...' : 'Busca por nombre, código, marca, modelo o placa'} searchable clearable data={options} value={selected} onChange={setSelected} disabled={loading} rightSection={loading ? <Loader size="xs" /> : undefined} nothingFoundMessage="No hay coincidencias" />
        {subject ? <MaintenancePanel key={`${subject.type}:${subject.id}`} subject={subject} /> : !loading && !error ? <Paper withBorder p="xl" radius="lg"><Text ta="center" c="dimmed">{subjects.length ? 'Selecciona un equipo o vehículo para consultar y registrar sus mantenimientos.' : 'No hay equipos propios ni vehículos activos disponibles.'}</Text></Paper> : null}
      </Stack>
    </Container>
  );
}
