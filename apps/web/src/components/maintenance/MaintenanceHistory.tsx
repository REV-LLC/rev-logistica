'use client';

import { Accordion, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import type { MaintenanceCompletion, MaintenanceItem, MaintenancePlan } from '@/lib/maintenance-types';

export default function MaintenanceHistory({ completions, plans, onConfigure, onComplete }: {
  completions: MaintenanceCompletion[];
  plans: MaintenancePlan[];
  onComplete?: (item: MaintenanceItem) => void;
  onConfigure: (item: MaintenanceItem) => void;
}) {
  const itemById = new Map(plans.filter((plan) => plan.active).flatMap((plan) => plan.items.map((item) => [item.id, item] as const)));
  const all = new Map(completions.map((completion) => [completion.id, completion]));
  for (const plan of plans) for (const item of plan.items) for (const completion of item.completions ?? []) all.set(completion.id, completion);
  const groups = new Map<string, MaintenanceCompletion[]>();
  for (const completion of [...all.values()].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())) {
    const key = completion.item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const entries = groups.get(key) ?? [];
    entries.push(completion);
    groups.set(key, entries);
  }
  return (
    <Stack>
      <Text size="sm" c="dimmed">Una tarjeta por trabajo, con su última ejecución. Despliega el historial para ver registros anteriores (hasta los últimos 100 trabajos).</Text>
      {!completions.length ? <Paper withBorder p="lg"><Text c="dimmed">Todavía no hay mantenimientos realizados. Registra el primero desde “Registrar mantenimiento”.</Text></Paper> : null}
      {[...groups.entries()].map(([key, entries]) => {
        const [completion, ...previous] = entries;
        const item = itemById.get(completion.item.id);
        const performer = completion.performedBy;
        const performerName = performer ? [performer.employee?.name, performer.employee?.lastName].filter(Boolean).join(' ') || performer.email : 'No registrado';
        const employee = completion.completedBy.employee;
        const author = [employee?.name, employee?.lastName].filter(Boolean).join(' ') || completion.completedBy.email;
        return (
          <Paper key={key} withBorder p="md" radius="md">
            <Stack gap="xs">
              <Group justify="space-between"><Text fw={700}>{completion.item.name}</Text>{completion.completedAtHours != null ? <Badge variant="light">{Number(completion.completedAtHours)} h</Badge> : null}</Group>
              <Text size="sm">{new Date(completion.completedAt).toLocaleString('es-CO')} · Registrado por {author}</Text>
              <Text size="sm" fw={600}>Realizado por: {performerName}</Text>
              {completion.reference ? <Text size="sm" fw={600}>Referencia: {completion.reference}</Text> : null}
              {completion.notes ? <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{completion.notes}</Text> : null}
              {item && (item.active || !item.notificationTopic) && onComplete ? <Button size="xs" variant="light" onClick={() => onComplete(item)}>Registrar siguiente mantenimiento</Button> : null}
              {previous.length ? <Accordion variant="contained"><Accordion.Item value="history"><Accordion.Control>Ver historial ({previous.length} anteriores)</Accordion.Control><Accordion.Panel><Stack gap="sm">{previous.map((entry) => <Paper key={entry.id} withBorder p="sm">
                <Text size="sm" fw={600}>{new Date(entry.completedAt).toLocaleString('es-CO')}{entry.completedAtHours != null ? ` · ${Number(entry.completedAtHours)} h` : ''}</Text>
                {entry.reference ? <Text size="sm">Referencia: {entry.reference}</Text> : null}
                <Text size="sm">Realizado por: {entry.performedBy ? [entry.performedBy.employee?.name, entry.performedBy.employee?.lastName].filter(Boolean).join(' ') || entry.performedBy.email : 'No registrado'}</Text>
                {entry.notes ? <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{entry.notes}</Text> : null}
              </Paper>)}</Stack></Accordion.Panel></Accordion.Item></Accordion> : null}
              {item && !item.notificationTopic ? <Button size="xs" variant="light" onClick={() => onConfigure({ ...item, active: true, baselineDate: completion.completedAt, baselineHours: completion.completedAtHours })}>Configurar próximos cambios</Button> : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
