"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "@/lib/api";
import { getSerialDisplayName, type SerialDisplayItem } from '@/lib/serial-assets';
import { kindLabels, type AccessoryKind } from "../accessories/types";
import { createSelectionId } from "./request-formatting";
import type { SelectedItem } from "./request-types";
import type { ReturnDocumentOrigin } from './return-document-origins';

type Option = {
  accessoryId: string;
  sourceBalanceId: string;
  name: string;
  code: string | null;
  kind: AccessoryKind;
  purpose?: 'COMPONENT' | 'ACCESSORY';
  quantity: number;
  ownerWarehouseId: string;
  ownerName: string;
  parentAssetId: string;
  parentName: string;
  sourceLabel: string;
  parentSourceDocumentItemId?: string;
  sourceDocumentItemId?: string;
};
type ParentOption = { key: string; assetId: string; accessoryId?: string; name: string; selectionId?: string; sourceDocumentItemId?: string; legacyOriginId?: string };
type Props = {
  deliveryMode: "WAREHOUSE" | "ON_SITE";
  warehouseId: string | null;
  customerWorksiteId: string;
  selectedItems: SelectedItem[];
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
};

export default function RequestAccessorySelector(props: Props) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Group my="md">
        <Button
          variant="light"
          disabled={!props.customerWorksiteId}
          onClick={() => setOpened(true)}
        >
          Agregar accesorios
        </Button>
      </Group>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Accesorios del documento"
        size="lg"
      >
        {opened ? <AccessoryOptions {...props} /> : null}
      </Modal>
    </>
  );
}

function AccessoryOptions({
  deliveryMode,
  warehouseId,
  customerWorksiteId,
  selectedItems,
  setSelectedItems,
}: Props) {
  const selectedParents: ParentOption[] = selectedItems.flatMap(item => {
    const assetId = item.assetId ?? item.componentParentAssetId;
    return assetId && (item.assetId || (item.accessoryKind === 'INDIVIDUAL' && item.accessoryPurpose !== 'COMPONENT'))
      ? [{ key: `line:${item.selectionId}`, assetId, accessoryId: item.accessoryId, name: item.name, selectionId: item.selectionId }] : [];
  });
  const [onsiteParents, setOnsiteParents] = useState<ParentOption[]>([]);
  const [parentError, setParentError] = useState("");
  const parents = [
    ...selectedParents,
    ...onsiteParents.filter(
      (item) =>
        !selectedParents.some((parent) => parent.assetId === item.assetId && parent.accessoryId === item.accessoryId),
    ),
  ];
  const [assetId, setAssetId] = useState<string | null>(
    parents[0]?.key ?? null,
  );
  const parent = parents.find(item => item.key === assetId);
  const anchorAssetId = parent?.assetId;
  const parentAccessoryId = parent?.accessoryId;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ items: Option[]; hasMore: boolean }>({
    items: [],
    hasMore: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const getOnsiteAccessories = async () => {
      const all: Option[] = [];
      for (let page = 0; page < 20; page++) {
        const result = await api<{ items: Option[]; hasMore: boolean }>(`/accessories/document-options?type=RETURN&customerWorksiteId=${customerWorksiteId}&page=${page}`, { signal: controller.signal });
        all.push(...result.items.filter(item => item.kind === 'INDIVIDUAL' && item.purpose !== 'COMPONENT' && item.sourceDocumentItemId));
        if (!result.hasMore) return all;
      }
      throw new Error('Demasiados accesorios: acota la selección desde la configuración del equipo.');
    };
    Promise.all([api<{
      serial: Array<SerialDisplayItem & {
        assetId: string;
        ownerWarehouseName?: string | null;
      }>;
    }>(`/inventory/on-site/${customerWorksiteId}/request-options`, {
      signal: controller.signal,
    }), getOnsiteAccessories(), api<ReturnDocumentOrigin[]>(`/equipment-configurations/return-origins?customerWorksiteId=${customerWorksiteId}`, { signal: controller.signal }),
      api<Array<{ id: string; assetId: string }>>(`/legacy-equipment-origins/active?customerWorksiteId=${customerWorksiteId}`, { signal: controller.signal })])
      .then(([data, accessories, origins, bridges]) => {
        if (!controller.signal.aborted)
          setOnsiteParents(
            [...data.serial.filter(item => origins.some(origin => origin.assetId === item.assetId) || bridges.some(origin => origin.assetId === item.assetId)).map((item) => ({
              key: `asset:${item.assetId}`,
              assetId: item.assetId,
              sourceDocumentItemId: origins.find(origin => origin.assetId === item.assetId)?.sourceDocumentItemId,
              legacyOriginId: bridges.find(origin => origin.assetId === item.assetId)?.id,
              name: `${getSerialDisplayName(item)}${item.ownerWarehouseName ? ` · ${item.ownerWarehouseName}` : ''} · En obra`,
            })), ...accessories.map(item => ({ key: `source:${item.sourceDocumentItemId}`, assetId: item.parentAssetId,
              accessoryId: item.accessoryId, sourceDocumentItemId: item.sourceDocumentItemId, name: `${item.name} (ya en obra)` }))],
          );
        if (!controller.signal.aborted && data.serial.some(item => !origins.some(origin => origin.assetId === item.assetId) && !bridges.some(origin => origin.assetId === item.assetId)))
          setParentError('Hay equipos de entregas antiguas pendientes de empalme individual. Office debe revisar su origen antes de agregarles accesorios nuevos.');
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted)
          setParentError(
            `No se pudieron consultar equipos ya en obra: ${err.message}`,
          );
      });
    return () => controller.abort();
  }, [customerWorksiteId]);
  useEffect(() => {
    if (!anchorAssetId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      type: "REMISSION",
      deliveryMode,
      customerWorksiteId,
      page: String(page),
      search: query,
    });
    if (warehouseId) params.set("warehouseId", warehouseId);
    params.set("assetId", anchorAssetId);
    if (parentAccessoryId) params.set('parentAccessoryId', parentAccessoryId);
    api<typeof result>(`/accessories/document-options?${params}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setError(err.message);
          setResult({ items: [], hasMore: false });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [anchorAssetId, parentAccessoryId, customerWorksiteId, deliveryMode, page, query, warehouseId]);

  const add = (option: Option) =>
    setSelectedItems((current) => {
      if (!parent) return current;
      const belongsToParent = (item: SelectedItem) => parent.selectionId
        ? item.parentCompositionNodeId === parent.selectionId
        : parent.legacyOriginId ? item.parentLegacyOriginId === parent.legacyOriginId
        : item.parentSourceDocumentItemId === (parent.sourceDocumentItemId ?? option.parentSourceDocumentItemId) && item.componentParentAssetId === option.parentAssetId;
      if (
        current.some(
          (item) =>
            item.accessorySourceBalanceId === option.sourceBalanceId &&
            belongsToParent(item),
        )
      )
        return current;
      return [
        ...current,
        {
          selectionId: createSelectionId(),
          type: "accessory",
          accessoryId: option.accessoryId,
          accessorySourceBalanceId: option.sourceBalanceId,
          accessoryKind: option.kind,
          accessoryPurpose: option.purpose,
          componentParentAssetId: option.parentAssetId,
          ...(parent.selectionId ? { parentCompositionNodeId: parent.selectionId }
            : parent.legacyOriginId ? { parentLegacyOriginId: parent.legacyOriginId }
            : { parentSourceDocumentItemId: parent.sourceDocumentItemId ?? option.parentSourceDocumentItemId }),
          name: `${option.name} · ${option.parentName}`,
          quantity: 1,
          availableQuantity: option.quantity,
          ownerWarehouseId: option.ownerWarehouseId,
          sourceWarehouseId: warehouseId,
        },
      ];
    });
  return (
    <Stack>
      <Text size="sm">
        Disponibilidad sujeta a validación al aprobar.
      </Text>
      {parentError ? <Alert color="yellow">{parentError}</Alert> : null}
      <Select
        label="Equipo o accesorio que lo usará"
        data={parents.map((item) => ({
          value: item.key,
          label: item.name,
        }))}
        value={assetId}
        onChange={(value) => {
          setAssetId(value);
          setPage(0);
          setResult({ items: [], hasMore: false });
        }}
        searchable
      />
      {!parents.length ? (
        <Alert color="blue">
          Agrega el equipo a la remisión o espera a que se carguen los que ya
          están en esta obra.
        </Alert>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
              setPage(0);
            }}
          >
            <Group align="end">
              <TextInput
                label="Buscar accesorio"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                maxLength={160}
                style={{ flex: 1 }}
              />
              <Button type="submit">Buscar</Button>
            </Group>
          </form>
          {error ? <Alert color="red">{error}</Alert> : null}
          {loading ? (
            <Loader aria-label="Cargando accesorios" />
          ) : (
            result.items.map((option) => {
              const selected = selectedItems.some(
                (item) =>
                  item.accessorySourceBalanceId === option.sourceBalanceId &&
                  (parent?.selectionId ? item.parentCompositionNodeId === parent.selectionId
                    : item.parentSourceDocumentItemId === (parent?.sourceDocumentItemId ?? option.parentSourceDocumentItemId) && item.componentParentAssetId === option.parentAssetId),
              );
              return (
                <Card
                  key={`${option.sourceBalanceId}:${option.parentAssetId}`}
                  withBorder
                >
                  <Text fw={600}>
                    {option.name}
                  </Text>
                  <Text size="sm">{option.parentName}</Text>
                  <Text size="sm" c="dimmed">
                    {option.sourceLabel} · Dueño: {option.ownerName}
                  </Text>
                  <Group mt="xs" justify="space-between">
                    <Badge>
                      {kindLabels[option.kind]} · Disponibles: {option.quantity}
                    </Badge>
                    <Button
                      size="xs"
                      disabled={selected}
                      onClick={() => add(option)}
                    >
                      {selected ? "Agregado" : "Agregar al documento"}
                    </Button>
                  </Group>
                </Card>
              );
            })
          )}
          {!loading && !error && !result.items.length ? (
            <Text c="dimmed">
              No hay accesorios disponibles para esta selección.
            </Text>
          ) : null}
          <Group>
            <Button
              variant="default"
              disabled={page === 0 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="default"
              disabled={!result.hasMore || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Siguiente
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
