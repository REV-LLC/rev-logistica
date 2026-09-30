'use client';

import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import type { MaintenanceCompletion, MaintenanceItem, MaintenancePlan } from '@/lib/maintenance-types';

export default function MaintenanceHistory({ completions, plans, onConfigure }: {
  completions: MaintenanceCompletion[];
  plans: MaintenancePlan[];
  onConfigure: (item: MaintenanceItem) => void;
}) {
  const itemById = new Map(plans.filter((plan) => plan.active).flatMap((plan) => plan.items.map((item) => [item.id, item] as const)));
  return (
    <Stack>
      <Text size="sm" c="dimmed">Últimos 100 trabajos registrados, incluidos los de planes archivados.</Text>
      {!completions.length ? <Paper withBorder p="lg"><Text c="dimmed">Todavía no hay mantenimientos realizados. Registra el primero desde “Registrar mantenimiento”.</Text></Paper> : null}
      {completions.map((completion) => {
        const item = itemById.get(completion.item.id);
        const performer = completion.performedBy;
        const performerName = performer ? [performer.employee?.name, performer.employee?.lastName].filter(Boolean).join(' ') || performer.email : 'No registrado';
        const employee = completion.completedBy.employee;
        const author = [employee?.name, employee?.lastName].filter(Boolean).join(' ') || completion.completedBy.email;
        return (
          <Paper key={completion.id} withBorder p="md" radius="md">
            <Stack gap="xs">
              <Group justify="space-between"><Text fw={700}>{completion.item.name}</Text>{completion.completedAtHours != null ? <Badge variant="light">{Number(completion.completedAtHours)} h</Badge> : null}</Group>
              <Text size="sm">{new Date(completion.completedAt).toLocaleString('es-CO')} · Registrado por {author}</Text>
              <Text size="sm" fw={600}>Realizado por: {performerName}</Text>
              {completion.reference ? <Text size="sm" fw={600}>Referencia: {completion.reference}</Text> : null}
              {completion.notes ? <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{completion.notes}</Text> : null}
              {item && !item.notificationTopic ? <Button size="xs" variant="light" onClick={() => onConfigure({ ...item, active: true, baselineDate: completion.completedAt, baselineHours: completion.completedAtHours })}>Configurar próximos cambios</Button> : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
