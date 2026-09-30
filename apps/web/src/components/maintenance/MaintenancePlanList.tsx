'use client';

import {
  Accordion,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconEye,
  IconPencil,
  IconPlus,
} from '@tabler/icons-react';
import type {
  AppUserOption,
  MaintenanceItem,
  MaintenancePlan,
  MaintenanceScheduleType,
  NotificationReminder,
} from '@/lib/maintenance-types';

type Props = {
  plans: MaintenancePlan[];
  users: AppUserOption[];
  reminderByItemId: Map<string, NotificationReminder>;
  canManage: boolean;
  scheduleType: MaintenanceScheduleType;
  onAddItem: (plan: MaintenancePlan) => void;
  onEditItem: (item: MaintenanceItem) => void;
  onViewLatest: (item: MaintenanceItem) => void;
  onEditPlan: (plan: MaintenancePlan) => void;
};

function statusPresentation(status?: NotificationReminder['status']) {
  if (status === 'OVERDUE') return { label: 'Vencido', color: 'red' };
  if (status === 'DUE') return { label: 'Por realizar', color: 'yellow' };
  return { label: 'Próximo', color: 'gray' };
}
export default function MaintenancePlanList({
  plans,
  users,
  reminderByItemId,
  canManage,
  scheduleType,
  onAddItem,
  onEditItem,
  onViewLatest,
  onEditPlan,
}: Props) {
  const userById = new Map(users.map((user) => [user.id, user]));

  if (!plans.length) {
    return (
      <Paper withBorder radius="lg" p="xl" bg="gray.0">
        <Stack align="center" gap={4}>
          <Text fw={700}>Sin planes de mantenimiento</Text>
          <Text size="sm" c="dimmed" ta="center">
            {scheduleType === 'HOURS'
              ? 'Crea el primer plan para comenzar a controlar revisiones por horas.'
              : 'Crea el primer plan para programar revisiones por días calendario.'}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Accordion variant="separated" multiple defaultValue={plans.filter((plan) => plan.active).map((plan) => plan.id)}>
      {plans.map((plan) => (
        <Accordion.Item key={plan.id} value={plan.id}>
          <Accordion.Control>
            <Group justify="space-between" pr="md" wrap="wrap">
              <div>
                <Text fw={800}>{plan.name}</Text>
                <Text size="xs" c="dimmed">{plan.items.length} revisiones</Text>
              </div>
              <Badge color={plan.active ? 'green' : 'gray'} variant="light">
                {plan.active ? 'Activo' : 'Archivado'}
              </Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {canManage && plan.active ? (
                <Group justify="flex-end" gap="xs">
                  <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => onAddItem(plan)}>
                    Registrar cambios
                  </Button>
                  <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => onEditPlan(plan)}>
                    Configurar plan
                  </Button>

                </Group>
              ) : null}

              {plan.items.map((item) => {
                const latest = item.completions?.[0];
                const reminder = reminderByItemId.get(item.id);
                const presentation = statusPresentation(reminder?.status);
                const recipients = item.notificationTopic?.recipients ?? [];
                return (
                  <Paper key={item.id} withBorder radius="lg" p="md" bg={item.active ? undefined : 'gray.0'}>
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" wrap="wrap">
                        <div>
                          <Text fw={800}>{item.name}</Text>
                          <Text size="sm" c="dimmed">
                            {item.instructions || 'Sin instrucciones adicionales'}
                          </Text>
                        </div>
                        <Group gap="xs">
                          <Badge color={item.active ? presentation.color : 'gray'} variant="light">
                            {item.active ? presentation.label : item.notificationTopic ? 'Archivada' : 'Sin programación'}
                          </Badge>
                          {reminder?.remainingHours !== undefined ? (
                            <Badge color="blue" variant="outline">
                              {reminder.remainingHours >= 0
                                ? `${reminder.remainingHours} h restantes`
                                : `${Math.abs(reminder.remainingHours)} h vencidas`}
                            </Badge>
                          ) : null}
                          {reminder?.remainingDays !== undefined ? (
                            <Badge color="blue" variant="outline">
                              {reminder.remainingDays >= 0
                                ? `${reminder.remainingDays} días restantes`
                                : `${Math.abs(reminder.remainingDays)} días vencidos`}
                            </Badge>
                          ) : null}
                        </Group>
                      </Group>

                      <div>
                        <Text size="xs" c="dimmed">Última ejecución</Text>
                        {latest ? <Stack gap={2}>
                          <Text size="sm" fw={700}>{new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(latest.completedAt))}{latest.completedAtHours != null ? ` · ${Number(latest.completedAtHours)} h` : ''}</Text>
                          {latest.reference ? <Text size="sm">Referencia: {latest.reference}</Text> : null}
                          <Text size="sm">Realizado por: {latest.performedBy ? [latest.performedBy.employee?.name, latest.performedBy.employee?.lastName].filter(Boolean).join(' ') || latest.performedBy.email : 'No registrado'}</Text>
                        </Stack> : <Text size="sm" c="dimmed">Sin ejecuciones registradas</Text>}
                      </div>

                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                        <div>
                          <Text size="xs" c="dimmed">Intervalo</Text>
                          <Text size="sm" fw={700}>
                            {!item.notificationTopic ? 'Sin programación' : scheduleType === 'HOURS'
                              ? `${Number(item.intervalHours)} h`
                              : `${Number(item.intervalDays)} días calendario`}
                          </Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Aviso preventivo</Text>
                          <Text size="sm" fw={700}>
                            {!item.notificationTopic ? '—' : scheduleType === 'HOURS'
                              ? `${Number(item.warningHours)} h antes`
                              : `${Number(item.warningDays)} días antes`}
                          </Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Próximo vencimiento</Text>
                          <Text size="sm" fw={700}>
                            {reminder?.dueHours !== undefined
                              ? `${reminder.dueHours} h`
                              : reminder?.dueAt
                                ? new Intl.DateTimeFormat('es-CO', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  timeZone: 'UTC',
                                }).format(new Date(reminder.dueAt))
                                : !item.notificationTopic ? 'Sin programación' : 'Calculando'}
                          </Text>
                        </div>
                      </SimpleGrid>

                      <div>
                        <Text size="xs" c="dimmed" mb={4}>Destinatarios</Text>
                        <Group gap={6}>
                          {recipients.map((recipient) => (
                            <Badge key={recipient.userId} variant="light" color="gray">
                              {userById.get(recipient.userId)?.name ?? recipient.user?.email ?? recipient.userId}
                              {recipient.whatsappEnabled ? ' · WhatsApp' : ''}
                            </Badge>
                          ))}
                          {!recipients.length ? <Text size="sm" c="dimmed">Sin destinatarios</Text> : null}
                        </Group>
                      </div>

                      {canManage && (item.active || !item.notificationTopic) && plan.active ? (
                        <Group justify="flex-end" gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            color="green"
                            leftSection={<IconEye size={14} />}
                            onClick={() => onViewLatest(item)}
                          >
                            Ver último cambio
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            leftSection={<IconPencil size={14} />}
                            onClick={() => onEditItem(item)}
                          >
                            Configurar
                          </Button>

                        </Group>
                      ) : null}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
