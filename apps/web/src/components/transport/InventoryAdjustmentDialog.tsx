'use client';
import { getStockShortageReviewAction } from '@/lib/inventory-stock-errors';
import type { Warehouse } from './request-types';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';

type Props = {
  adjustWarningWarehouseId: string | null;
  setAdjustWarningWarehouseId: Dispatch<SetStateAction<string | null>>;
  warehouses: Warehouse[];
  adjustWarningModalOpen: boolean;
  setAdjustWarningModalOpen: Dispatch<SetStateAction<boolean>>;
  setAdjustWarningOwnerWarehouseId: Dispatch<SetStateAction<string | null>>;
  adjustWarningMessage: string | null;
  adjustWarningOwnerWarehouseId: string | null;
  router: ReturnType<typeof useRouter>;
};

export default function InventoryAdjustmentDialog({
  adjustWarningWarehouseId,
  setAdjustWarningWarehouseId,
  warehouses,
  adjustWarningModalOpen,
  setAdjustWarningModalOpen,
  setAdjustWarningOwnerWarehouseId,
  adjustWarningMessage,
  adjustWarningOwnerWarehouseId,
  router,
}: Props) {
  const stockReviewAction = getStockShortageReviewAction({
    ownerWarehouseId: adjustWarningOwnerWarehouseId,
    warehouseId: adjustWarningWarehouseId,
    warehouseType: warehouses.find(w => w.id === adjustWarningWarehouseId)?.type,
  });
  return (
    <Modal
      opened={adjustWarningModalOpen}
      onClose={() => {
        setAdjustWarningModalOpen(false);
        setAdjustWarningOwnerWarehouseId(null);
        setAdjustWarningWarehouseId(null);
      }}
      title="Revisar existencias en el origen"
      centered
    >
      <Stack gap="md">
        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
          {adjustWarningMessage ??
            'Revisa las existencias en la bodega de salida del documento.'}
        </Text>
        {adjustWarningWarehouseId && adjustWarningWarehouseId !== adjustWarningOwnerWarehouseId ? (
          <Text size="sm" c="dimmed">Comprueba primero el ingreso y la ubicación física del equipo antes de ajustar cantidades.</Text>
        ) : null}
        <Group justify="flex-end">
          <Button
            onClick={() => {
              setAdjustWarningModalOpen(false);
              if (stockReviewAction.href) router.push(stockReviewAction.href);
              setAdjustWarningOwnerWarehouseId(null);
        setAdjustWarningWarehouseId(null);
            }}
          >
            {stockReviewAction.label}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
