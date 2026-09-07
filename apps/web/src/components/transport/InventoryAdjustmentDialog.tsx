'use client';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';

type Props = {
  adjustWarningModalOpen: boolean;
  setAdjustWarningModalOpen: Dispatch<SetStateAction<boolean>>;
  setAdjustWarningOwnerWarehouseId: Dispatch<SetStateAction<string | null>>;
  adjustWarningMessage: string | null;
  adjustWarningOwnerWarehouseId: string | null;
  router: ReturnType<typeof useRouter>;
};

export default function InventoryAdjustmentDialog({
  adjustWarningModalOpen,
  setAdjustWarningModalOpen,
  setAdjustWarningOwnerWarehouseId,
  adjustWarningMessage,
  adjustWarningOwnerWarehouseId,
  router,
}: Props) {
  return (
    <Modal
      opened={adjustWarningModalOpen}
      onClose={() => {
        setAdjustWarningModalOpen(false);
        setAdjustWarningOwnerWarehouseId(null);
      }}
      title="Ajuste requerido"
      centered
    >
      <Stack gap="md">
        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
          {adjustWarningMessage ??
            'Primero ajusta el stock de bodega antes de hacer movimientos.'}
        </Text>
        <Group justify="flex-end">
          <Button
            onClick={() => {
              setAdjustWarningModalOpen(false);
              const params = new URLSearchParams();
              if (adjustWarningOwnerWarehouseId) {
                params.set('ownerWarehouseId', adjustWarningOwnerWarehouseId);
                params.set('warehouseId', adjustWarningOwnerWarehouseId);
              }
              router.push(
                `/inventory/bulk-adjustments${params.toString() ? `?${params.toString()}` : ''}`,
              );
              setAdjustWarningOwnerWarehouseId(null);
            }}
          >
            Entendido
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
