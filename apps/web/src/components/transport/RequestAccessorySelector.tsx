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
import { kindLabels, type AccessoryKind } from "../accessories/types";
import { createSelectionId } from "./request-formatting";
import type { SelectedItem } from "./request-types";

type Option = {
  accessoryId: string;
  sourceBalanceId: string;
  name: string;
  code: string | null;
  kind: AccessoryKind;
  quantity: number;
  ownerWarehouseId: string;
  ownerName: string;
  parentAssetId: string;
  parentName: string;
  sourceLabel: string;
};
type Props = {
  docType: "REMISSION" | "RETURN";
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
          {props.docType === "RETURN"
            ? "Devolver accesorios"
            : "Agregar accesorios"}
        </Button>
        <Text size="sm" c="dimmed">
          Opcional. Se registran por separado del equipo.
        </Text>
      </Group>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          props.docType === "RETURN"
            ? "Accesorios pendientes en la obra"
            : "Accesorios del documento"
        }
        size="lg"
      >
        {opened ? <AccessoryOptions {...props} /> : null}
      </Modal>
    </>
  );
}

function AccessoryOptions({
  docType,
  deliveryMode,
  warehouseId,
  customerWorksiteId,
  selectedItems,
  setSelectedItems,
}: Props) {
  const selectedParents = selectedItems.filter(
    (item) => item.type === "serial" && item.assetId,
  );
  const [onsiteParents, setOnsiteParents] = useState<
    Array<{ assetId: string; name: string }>
  >([]);
  const [parentError, setParentError] = useState("");
  const parents = [
    ...selectedParents,
    ...onsiteParents.filter(
      (item) =>
        !selectedParents.some((parent) => parent.assetId === item.assetId),
    ),
  ];
  const [assetId, setAssetId] = useState<string | null>(
    parents[0]?.assetId ?? null,
  );
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
    if (docType !== "REMISSION") return;
    const controller = new AbortController();
    api<{
      serial: Array<{
        assetId: string;
        skuName?: string | null;
        publicCode?: string | null;
      }>;
    }>(`/inventory/on-site/${customerWorksiteId}/request-options`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setOnsiteParents(
            data.serial.map((item) => ({
              assetId: item.assetId,
              name: `${item.skuName ?? "Equipo"} · ${item.publicCode ?? item.assetId} (ya en obra)`,
            })),
          );
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted)
          setParentError(
            `No se pudieron consultar equipos ya en obra: ${err.message}`,
          );
      });
    return () => controller.abort();
  }, [customerWorksiteId, docType]);
  useEffect(() => {
    if (docType === "REMISSION" && !assetId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      type: docType,
      deliveryMode,
      customerWorksiteId,
      page: String(page),
      search: query,
    });
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (docType === "REMISSION" && assetId) params.set("assetId", assetId);
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
  }, [
    assetId,
    customerWorksiteId,
    deliveryMode,
    docType,
    page,
    query,
    warehouseId,
  ]);

  const add = (option: Option) =>
    setSelectedItems((current) => {
      if (
        current.some(
          (item) =>
            item.accessorySourceBalanceId === option.sourceBalanceId &&
            item.componentParentAssetId === option.parentAssetId,
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
          componentParentAssetId: option.parentAssetId,
          name: `${option.name}${option.code ? ` · ${option.code}` : ""} · Accesorio de ${option.parentName}`,
          quantity: 1,
          availableQuantity: option.quantity,
          ownerWarehouseId: option.ownerWarehouseId,
          sourceWarehouseId: docType === 'REMISSION' ? warehouseId : undefined,
        },
      ];
    });
  return (
    <Stack>
      <Text size="sm">
        El borrador no reserva existencias. Al aprobar se validarán nuevamente.
        Los consumibles se entregan por cantidad; el consumo se registra aparte
        en su card.
      </Text>
      {parentError ? <Alert color="yellow">{parentError}</Alert> : null}
      {docType === "REMISSION" ? (
        <Select
          label="Equipo que usará el accesorio"
          data={parents.map((item) => ({
            value: item.assetId!,
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
      ) : null}
      {docType === "REMISSION" && !parents.length ? (
        <Alert color="blue">
          Agrega el equipo a la remisión o espera a que se carguen los que ya
          están en esta obra. Para devolver accesorios no es necesario devolver
          también el equipo.
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
                  item.componentParentAssetId === option.parentAssetId,
              );
              return (
                <Card
                  key={`${option.sourceBalanceId}:${option.parentAssetId}`}
                  withBorder
                >
                  <Text fw={600}>
                    {option.name}
                    {option.code ? ` · ${option.code}` : ""}
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
