'use client';

import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { InventoryItemPickerSerialItem } from '@/components/InventoryItemPickerModal';
import { getSerialDisplayName } from '@/lib/serial-assets';

export default function MixerMotorSelectionModal({
  opened,
  mixer,
  motors,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  opened: boolean;
  mixer: InventoryItemPickerSerialItem | null;
  motors: InventoryItemPickerSerialItem[];
  loading: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (motor: InventoryItemPickerSerialItem) => void;
}) {
  const [motorId, setMotorId] = useState<string | null>(null);
  const options = useMemo(
    () =>
      motors.map((motor) => ({
        value: motor.assetId,
        label: `${getSerialDisplayName(motor)}${motor.serialOrEngine ? ` · ${motor.serialOrEngine}` : ''}`,
      })),
    [motors],
  );

  useEffect(() => {
    if (!opened || !mixer) return;
    const assignedIsAvailable = motors.some((motor) => motor.assetId === mixer.assignedMotorId);
    setMotorId(assignedIsAvailable ? mixer.assignedMotorId ?? null : null);
  }, [mixer, motors, opened]);

  const selectedMotor = motors.find((motor) => motor.assetId === motorId) ?? null;

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title="Seleccionar motor de la mezcladora"
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      <Stack gap="md">
        <div>
          <Text fw={700}>{mixer ? getSerialDisplayName(mixer) : 'Mezcladora'}</Text>
          <Text size="sm" c="dimmed">
            Confirma el motor que saldrá con esta mezcladora. El asignado actualmente aparece seleccionado.
          </Text>
        </div>

        {error ? <Alert color="red">{error}</Alert> : null}

        <Select
          label="Motor"
          placeholder="Buscar por referencia, número o serial"
          data={options}
          value={motorId}
          onChange={setMotorId}
          searchable
          nothingFoundMessage="No hay motores disponibles en esta bodega"
          required
        />

        {!motors.length ? (
          <Alert color="yellow">
            No hay motores disponibles. Registra uno en inventario o libera uno asignado a otra mezcladora.
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => selectedMotor && onConfirm(selectedMotor)}
            disabled={!selectedMotor}
            loading={loading}
          >
            Confirmar motor
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
