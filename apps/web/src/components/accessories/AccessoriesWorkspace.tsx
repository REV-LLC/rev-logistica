"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import AccessoryCard from "./AccessoryCard";
import {
  Accessory,
  Equipment,
  equipmentLabel,
  includeEquipmentCompatibility,
} from "./types";

const AccessoryForm = dynamic(() => import("./AccessoryForm"), {
  loading: () => <Loader />,
});
const AccessoryMovementForm = dynamic(() => import("./AccessoryMovementForm"), {
  loading: () => <Loader />,
});
const AccessoryHistory = dynamic(() => import("./AccessoryHistory"), {
  loading: () => <Loader />,
});
const ExistingAccessoryPicker = dynamic(
  () => import("./ExistingAccessoryPicker"),
  { loading: () => <Loader /> },
);
type Dialog =
  | { type: "create" | "link" }
  | { type: "edit" | "move" | "history"; item: Accessory };

export default function AccessoriesWorkspace({
  equipmentId,
  initialCreate = false,
}: {
  equipmentId?: string;
  initialCreate?: boolean;
}) {
  const [equipment, setEquipment] = useState<Equipment>();
  const [items, setItems] = useState<Accessory[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [initialOffered, setInitialOffered] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), search: query });
    if (equipmentId) params.set("assetId", equipmentId);
    Promise.all([
      api<{ items: Accessory[]; hasMore: boolean }>(`/accessories?${params}`, {
        signal: controller.signal,
      }),
      equipmentId
        ? api<Equipment>(`/accessories/equipment/${equipmentId}`, {
            signal: controller.signal,
          })
        : Promise.resolve(undefined),
    ])
      .then(([result, asset]) => {
        setItems(result.items);
        setHasMore(result.hasMore);
        setEquipment(asset);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [equipmentId, page, query, revision]);

  useEffect(() => {
    if (
      initialCreate &&
      !initialOffered &&
      !loading &&
      !error &&
      (!equipmentId || equipment)
    ) {
      setDialog({ type: "create" });
      setInitialOffered(true);
    }
  }, [initialCreate, initialOffered, loading, error, equipmentId, equipment]);

  const close = useCallback(() => setDialog(null), []);
  const saved = () => {
    setDialog(null);
    setSuccess("Accesorio actualizado correctamente.");
    setRevision((r) => r + 1);
  };
  const open = async (type: "edit" | "move" | "history", item: Accessory) => {
    setError("");
    try {
      setDialog({
        type,
        item: await api<Accessory>(`/accessories/${item.id}`),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo abrir el accesorio.",
      );
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Text fw={700} size="xl">
            Accesorios
          </Text>
          <Text size="sm" c="dimmed">
            {equipment
              ? equipmentLabel(equipment)
              : "Individualizados, retornables por cantidad y consumibles · compatibilidad, existencias y trazabilidad"}
          </Text>
        </div>
        <Group>
          {equipment ? (
            <Button
              variant="default"
              disabled={loading}
              onClick={() => setDialog({ type: "link" })}
            >
              Vincular accesorio existente
            </Button>
          ) : null}
          <Button
            disabled={loading || !!error}
            onClick={() => {
              setSuccess("");
              setDialog({ type: "create" });
            }}
          >
            Agregar accesorio
          </Button>
        </Group>
      </Group>
      {equipmentId ? (
        <Text size="sm">
          Aquí aparecen los accesorios compatibles y los asignados a este
          equipo. Puedes crear uno nuevo o entregar existencias de una card
          existente.
        </Text>
      ) : null}
      <Alert color="blue" variant="light">
        Crea y edita accesorios aquí. Para entregarlos o devolverlos de una
        obra, agrégalos en la remisión o devolución de Transporte. El consumo se
        registra desde su card; una entrega no consume existencias. Los
        componentes anteriores conservan su flujo y no se convierten
        automáticamente.
      </Alert>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(0);
        }}
      >
        <Group align="flex-end">
          <TextInput
            label="Buscar accesorio"
            placeholder="Nombre o código"
            maxLength={160}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="default">
            Buscar
          </Button>
          <Button variant="subtle" onClick={() => setRevision((r) => r + 1)}>
            Actualizar
          </Button>
        </Group>
      </form>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert color="green" role="status">
          {success}
        </Alert>
      ) : null}
      {loading ? (
        <Loader aria-label="Cargando accesorios" />
      ) : (
        <>
          {!items.length && !error ? (
            <Text c="dimmed">
              {equipmentId
                ? "Este equipo todavía no tiene accesorios compatibles registrados. Agregar accesorios es opcional."
                : "No hay accesorios para esta búsqueda."}
            </Text>
          ) : null}
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {items.map((item) => (
              <AccessoryCard
                key={item.id}
                item={item}
                equipmentId={equipmentId}
                onEdit={() => void open("edit", item)}
                onMove={() => void open("move", item)}
                onHistory={() => void open("history", item)}
              />
            ))}
          </SimpleGrid>
        </>
      )}
      <Group justify="space-between">
        <Button
          variant="default"
          disabled={!page || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <Text size="sm">Página {page + 1}</Text>
        <Button
          variant="default"
          disabled={!hasMore || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </Group>
      <Modal
        opened={!!dialog}
        onClose={close}
        title={
          dialog?.type === "create"
            ? "Crear accesorio"
            : dialog?.type === "link"
              ? "Vincular accesorio existente"
              : dialog?.type === "edit"
                ? "Editar accesorio"
                : dialog?.type === "move"
                  ? "Movimiento de accesorio"
                  : "Historial del accesorio"
        }
        size="lg"
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        transitionProps={{ duration: 0 }}
      >
        {dialog?.type === "link" && equipment ? (
          <ExistingAccessoryPicker
            familyId={equipment.sku.assetFamilyId}
            onCancel={close}
            onSelect={(item) => {
              try {
                setDialog({
                  type: "edit",
                  item: includeEquipmentCompatibility(item, equipment),
                });
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "No se pudo vincular.",
                );
                close();
              }
            }}
          />
        ) : null}
        {dialog?.type === "create" ? (
          <AccessoryForm
            equipment={equipment}
            onSaved={() => {
              saved();
              setSuccess(
                "Accesorio creado. La compatibilidad quedó guardada; usa Registrar movimiento para entregarlo a un equipo.",
              );
            }}
            onCancel={close}
          />
        ) : null}
        {dialog?.type === "edit" ? (
          <AccessoryForm
            item={dialog.item}
            equipment={equipment}
            onSaved={saved}
            onCancel={close}
          />
        ) : null}
        {dialog?.type === "move" ? (
          <AccessoryMovementForm
            item={dialog.item}
            equipment={equipment}
            onSaved={saved}
            onCancel={close}
          />
        ) : null}
        {dialog?.type === "history" ? (
          <Stack>
            <AccessoryHistory accessoryId={dialog.item.id} />
            <Button variant="default" onClick={close}>
              Cerrar
            </Button>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
