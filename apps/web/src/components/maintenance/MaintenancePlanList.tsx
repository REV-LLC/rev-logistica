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
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
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
  onCompleteItem: (item: MaintenanceItem) => void;
  onArchiveItem: (item: MaintenanceItem) => void;
  onEditPlan: (plan: MaintenancePlan) => void;
  onArchivePlan: (plan: MaintenancePlan) => void;
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
  onCompleteItem,
  onArchiveItem,
  onEditPlan,
  onArchivePlan,
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
                    Agregar revisión
                  </Button>
                  <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => onEditPlan(plan)}>
                    Editar plan
                  </Button>
                  <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={() => onArchivePlan(plan)}>
                    Archivar
                  </Button>
                </Group>
              ) : null}

              {plan.items.map((item) => {
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
                            {item.active ? presentation.label : 'Archivada'}
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

                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                        <div>
                          <Text size="xs" c="dimmed">Intervalo</Text>
                          <Text size="sm" fw={700}>
                            {scheduleType === 'HOURS'
                              ? `${Number(item.intervalHours)} h`
                              : `${Number(item.intervalDays)} días calendario`}
                          </Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Aviso preventivo</Text>
                          <Text size="sm" fw={700}>
                            {scheduleType === 'HOURS'
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
                                : 'Calculando'}
                          </Text>
                        </div>
                      </SimpleGrid>

                      <div>
                        <Text size="xs" c="dimmed" mb={4}>Destinatarios</Text>
                        <Group gap={6}>
                          {recipients.map((recipient) => (
                            <Badge key={recipient.userId} variant="light" color="gray">
                              {userById.get(recipient.userId)?.name ?? recipient.user?.email ?? recipient.userId}
                              {recipient.emailEnabled ? ' · correo' : ''}
                              {recipient.smsEnabled ? ' · SMS' : ''}
                            </Badge>
                          ))}
                          {!recipients.length ? <Text size="sm" c="dimmed">Sin destinatarios</Text> : null}
                        </Group>
                      </div>

                      {canManage && item.active && plan.active ? (
                        <Group justify="flex-end" gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            color="green"
                            leftSection={<IconCheck size={14} />}
                            onClick={() => onCompleteItem(item)}
                          >
                            Registrar realizado
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            leftSection={<IconPencil size={14} />}
                            onClick={() => onEditItem(item)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            onClick={() => onArchiveItem(item)}
                          >
                            Archivar
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
