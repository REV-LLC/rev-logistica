'use client';
import { getSerialDisplayName } from '@/lib/serial-assets';
import {
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import type { Dispatch, SetStateAction } from 'react';
import { parseInternalNumberFromTag } from './request-formatting';
import {
  RequestDocumentDetail,
  ResolveInventoryByOwner,
  SkuOption,
  Warehouse,
} from './request-types';

type Props = {
  getDocumentSourceName: (doc: RequestDocumentDetail, ownerId?: string | null) => string;
  resolveModalOpen: boolean;
  closeResolveModal: () => void;
  resolveDocument: RequestDocumentDetail | null;
  isResolvePendingItem: (
    item: RequestDocumentDetail['items'][number],
  ) => boolean;
  warehouses: Warehouse[];
  getResolveSkuOptions: (
    ownerWarehouseId?: string | null,
  ) => { value: string; label: string }[];
  resolveSkuByIndex: Record<number, string>;
  setResolveSkuByIndex: Dispatch<SetStateAction<Record<number, string>>>;
  setResolveAssetByIndex: Dispatch<SetStateAction<Record<number, string>>>;
  skuOptions: SkuOption[];
  resolveInventoryByOwner: ResolveInventoryByOwner;
  resolveAssetByIndex: Record<number, string>;
  openCreateSerialForRow: (index: number) => void;
  resolvingApprove: boolean;
  resolveAndApprove: () => Promise<void>;
};

export default function ApprovalResolutionDialog({
  getDocumentSourceName,
  resolveModalOpen,
  closeResolveModal,
  resolveDocument,
  isResolvePendingItem,
  warehouses,
  getResolveSkuOptions,
  resolveSkuByIndex,
  setResolveSkuByIndex,
  setResolveAssetByIndex,
  skuOptions,
  resolveInventoryByOwner,
  resolveAssetByIndex,
  openCreateSerialForRow,
  resolvingApprove,
  resolveAndApprove,
}: Props) {
  return (
    <Modal
      opened={resolveModalOpen}
      onClose={closeResolveModal}
      title="Resolver tags antes de aprobar"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Masivo resuelve por SKU. Serializado resuelve por equipo especifico
          (interno #).
        </Text>
        {(resolveDocument?.items ?? [])
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => isResolvePendingItem(item))
          .map(({ item, index }) => (
            <Paper
              key={`${item.requestedTag}-${index}`}
              withBorder
              p="sm"
              radius="md"
            >
              <Stack gap={6}>
                <Text fw={600}>
                  {item.requestedTag ?? item.sku?.name ?? `Item ${index + 1}`}
                </Text>
                <Text size="xs" c="dimmed">
                  Cantidad: {Number(item.quantity ?? 1) || 1}
                </Text>
                <Text size="xs" c="dimmed">
                  Propietario:{' '}
                  {warehouses.find(
                    (warehouse) => warehouse.id === item.condition,
                  )?.name ?? '-'}
                </Text>
                {resolveDocument?.type === 'REMISSION' ? (
                  <Text size="xs" c="dimmed">Salida física: {getDocumentSourceName(resolveDocument, item.condition)}</Text>
                ) : null}
                <Select
                  label="Equipo"
                  placeholder="Buscar referencia de equipo"
                  searchable
                  data={getResolveSkuOptions(item.condition)}
                  value={resolveSkuByIndex[index] ?? null}
                  nothingFoundMessage="No hay referencias en el catálogo"
                  onChange={(value) => {
                    setResolveSkuByIndex((prev) => ({
                      ...prev,
                      [index]: value ?? '',
                    }));
                    setResolveAssetByIndex((prev) => ({
                      ...prev,
                      [index]: '',
                    }));
                  }}
                />
                {(() => {
                  const selectedSkuId = resolveSkuByIndex[index];
                  const selectedSku = skuOptions.find(
                    (entry) => entry.id === selectedSkuId,
                  );
                  if (selectedSku?.controlType !== 'SERIAL') return null;
                  const ownerWarehouseId = item.condition?.trim() ?? '';
                  const inventory =
                    resolveInventoryByOwner[ownerWarehouseId]?.serial ?? [];
                  const expectedInternal = parseInternalNumberFromTag(
                    item.requestedTag,
                  );
                  const serialOptions = inventory
                    .filter((serial) => serial.skuId === selectedSku.id)
                    .map((serial) => ({
                      value: serial.assetId,
                      label: getSerialDisplayName(serial),
                    }));
                  const hasExpected =
                    expectedInternal == null
                      ? false
                      : inventory.some(
                          (serial) =>
                            serial.skuId === selectedSku.id &&
                            serial.internalNumber === expectedInternal,
                        );
                  return (
                    <Stack gap={6}>
                      <Select
                        label="Equipo serial"
                        placeholder="Seleccionar equipo"
                        searchable
                        data={serialOptions}
                        value={resolveAssetByIndex[index] ?? null}
                        nothingFoundMessage="No hay equipo para este SKU en esa bodega"
                        onChange={(value) =>
                          setResolveAssetByIndex((prev) => ({
                            ...prev,
                            [index]: value ?? '',
                          }))
                        }
                      />
                      {expectedInternal != null && !hasExpected ? (
                        <Text size="xs" c="orange.7">
                          El tag solicita #{expectedInternal}, pero no aparece disponible
                          en la bodega de salida.
                        </Text>
                      ) : null}
                      {!serialOptions.length ||
                      (expectedInternal != null && !hasExpected) ? (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => openCreateSerialForRow(index)}
                        >
                          Crear equipo faltante
                        </Button>
                      ) : null}
                    </Stack>
                  );
                })()}
              </Stack>
            </Paper>
          ))}

        <Group justify="flex-end" className="mobile-actions">
          <Button
            variant="default"
            onClick={closeResolveModal}
            disabled={resolvingApprove}
          >
            Cancelar
          </Button>
          <Button onClick={resolveAndApprove} loading={resolvingApprove}>
            Resolver y aprobar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
