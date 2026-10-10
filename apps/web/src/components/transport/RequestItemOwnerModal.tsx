'use client';

import { Button, Group, Modal, Stack } from '@mantine/core';
import { useState } from 'react';
import WarehouseSelect from '@/components/WarehouseSelect';
import { getItemOwnerLabel } from './request-item-owners';
import type { Warehouse } from './request-types';

export default function RequestItemOwnerModal({ opened, warehouses, onClose, onConfirm }: {
  opened: boolean;
  warehouses: Warehouse[];
  onClose: () => void;
  onConfirm: (ownerId: string) => void;
}) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const validOwner = warehouses.some(warehouse => warehouse.id === ownerId);
  return <Modal opened={opened} onClose={onClose} title="¿De quién es el equipo?" centered size="md" radius="md">
    <Stack>
      <WarehouseSelect
        label="Dueño del equipo"
        placeholder="Seleccionar proveedor"
        warehouses={warehouses.map(warehouse => ({ ...warehouse, name: getItemOwnerLabel(warehouse) }))}
        formatLabels={false}
        clearable={false}
        value={ownerId}
        onChange={setOwnerId}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button disabled={!validOwner} onClick={() => { if (ownerId && validOwner) onConfirm(ownerId); }}>Continuar</Button>
      </Group>
    </Stack>
  </Modal>;
}
