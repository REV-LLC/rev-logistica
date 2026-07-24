'use client';

import { useEffect, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import MaintenanceItemFields from './MaintenanceItemFields';
import { api } from '@/lib/api';
import {
  apiErrorMessage,
  emptyMaintenanceItemInput,
  type AppUserOption,
  type MaintenanceItemInput,
  type MaintenanceSubject,
} from '@/lib/maintenance-types';

type Props = {
  opened: boolean;
  subject: MaintenanceSubject;
  users: AppUserOption[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function validateItem(item: MaintenanceItemInput) {
  if (!item.name.trim()) return 'Escribe el nombre de la revisión.';
  if (item.intervalHours === '' || item.intervalHours <= 0) return 'El intervalo debe ser mayor que cero.';
  if (item.warningHours !== '' && item.warningHours < 0) return 'Las horas de aviso no pueden ser negativas.';
  if (item.baselineHours !== '' && item.baselineHours < 0) return 'La línea base no puede ser negativa.';
  if (!item.recipients.length) return 'Selecciona al menos un destinatario.';
  return null;
}
export default function MaintenancePlanFormModal({
  opened,
  subject,
  users,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [items, setItems] = useState<MaintenanceItemInput[]>([emptyMaintenanceItemInput()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Array<string | null>>([]);

  useEffect(() => {
    if (!opened) return;
    setName('');
    setItems([emptyMaintenanceItemInput()]);
    setError(null);
    setItemErrors([]);
  }, [opened]);

  const save = async () => {
    if (!name.trim()) {
      setError('Escribe el nombre del plan.');
      return;
    }
    const validationErrors = items.map(validateItem);
    setItemErrors(validationErrors);
    if (validationErrors.some(Boolean)) {
      setError('Revisa las revisiones antes de guardar.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api('/maintenance/plans', {
        method: 'POST',
        json: {
          ...(subject.type === 'ASSET' ? { assetId: subject.id } : { vehicleId: subject.id }),
          name: name.trim(),
          active: true,
          items: items.map((item) => ({
            name: item.name.trim(),
            instructions: item.instructions.trim() || undefined,
            intervalHours: item.intervalHours,
            warningHours: item.warningHours === '' ? 0 : item.warningHours,
            baselineHours: item.baselineHours === '' ? 0 : item.baselineHours,
            active: item.active,
            recipients: item.recipients,
          })),
        },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo crear el plan.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Nuevo plan · ${subject.label}`}
      size="xl"
      centered
    >
      <Stack gap="lg">
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <TextInput
          label="Nombre del plan"
          placeholder="Ej. Mantenimiento general"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />

        <Group justify="space-between">
          <div>
            <Text fw={800}>Revisiones</Text>
            <Text size="sm" c="dimmed">Configura los ciclos y sus destinatarios.</Text>
          </div>
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => setItems((current) => [...current, emptyMaintenanceItemInput()])}
          >
            Agregar revisión
          </Button>
        </Group>

        <Accordion variant="separated" defaultValue="item-0">
          {items.map((item, index) => (
            <Accordion.Item key={`item-${index}`} value={`item-${index}`}>
              <Accordion.Control>
                <Group justify="space-between" pr="sm" wrap="nowrap">
                  <Text fw={700}>{item.name.trim() || `Revisión ${index + 1}`}</Text>
                  {itemErrors[index] ? <Badge color="red">Revisar</Badge> : null}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {itemErrors[index] ? <Alert color="red">{itemErrors[index]}</Alert> : null}
                  <MaintenanceItemFields
                    value={item}
                    users={users}
                    onChange={(next) => setItems((current) => (
                      current.map((candidate, candidateIndex) => candidateIndex === index ? next : candidate)
                    ))}
                    recipientError={itemErrors[index]?.includes('destinatario') ? itemErrors[index] : null}
                  />
                  {items.length > 1 ? (
                    <Paper withBorder radius="md" p="xs">
                      <Group justify="flex-end">
                        <ActionIcon
                          color="red"
                          variant="light"
                          aria-label={`Eliminar revisión ${index + 1}`}
                          onClick={() => setItems((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ) : null}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Crear plan</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
