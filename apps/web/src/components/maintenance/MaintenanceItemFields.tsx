'use client';

import { NumberInput, SimpleGrid, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import NotificationRecipientsEditor from '@/components/notifications/NotificationRecipientsEditor';
import type {
  AppUserOption,
  MaintenanceItemInput,
} from '@/lib/maintenance-types';

type Props = {
  value: MaintenanceItemInput;
  users: AppUserOption[];
  onChange: (value: MaintenanceItemInput) => void;
  recipientError?: string | null;
};

export default function MaintenanceItemFields({
  value,
  users,
  onChange,
  recipientError,
}: Props) {
  return (
    <Stack gap="md">
      <TextInput
        label="Nombre de la revisión"
        placeholder="Ej. Cambio de aceite"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.currentTarget.value })}
        required
      />
      <Textarea
        label="Instrucciones"
        placeholder="Describe las tareas que deben realizarse"
        value={value.instructions}
        onChange={(event) => onChange({ ...value, instructions: event.currentTarget.value })}
        minRows={2}
        autosize
      />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <NumberInput
          label="Intervalo"
          description="Cada cuántas horas"
          value={value.intervalHours}
          onChange={(next) => onChange({
            ...value,
            intervalHours: typeof next === 'number' ? next : '',
          })}
          min={0.01}
          decimalScale={2}
          suffix=" h"
          required
        />
        <NumberInput
          label="Avisar antes"
          description="Margen preventivo"
          value={value.warningHours}
          onChange={(next) => onChange({
            ...value,
            warningHours: typeof next === 'number' ? next : '',
          })}
          min={0}
          decimalScale={2}
          suffix=" h"
        />
        <NumberInput
          label="Línea base"
          description="Inicio del primer ciclo"
          value={value.baselineHours}
          onChange={(next) => onChange({
            ...value,
            baselineHours: typeof next === 'number' ? next : '',
          })}
          min={0}
          decimalScale={2}
          suffix=" h"
        />
      </SimpleGrid>
      <NotificationRecipientsEditor
        users={users}
        value={value.recipients}
        onChange={(recipients) => onChange({ ...value, recipients })}
        error={recipientError}
      />
      <Switch
        label="Revisión activa"
        checked={value.active}
        onChange={(event) => onChange({ ...value, active: event.currentTarget.checked })}
      />
    </Stack>
  );
}
