"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  FileInput,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import {
  IconBuildingWarehouse,
  IconCamera,
  IconCheck,
  IconRefresh,
  IconSearch,
  IconTruckLoading,
} from "@tabler/icons-react";
import { api, ApiError } from "@/lib/api";

type WarehouseOption = { id: string; name: string };

type ProviderStockItem = {
  key: string;
  type: "BULK" | "SERIAL";
  skuId: string | null;
  assetId: string | null;
  name: string;
  family: string;
  subfamily: string | null;
  reference: string | null;
  availableQuantity: number;
};

type RecentPickup = {
  id: string;
  consecutive: string | null;
  status: "DRAFT" | "CONFIRMED" | "FAILED" | "VOID";
  docDate: string;
  notes: string | null;
  providerWarehouse: WarehouseOption | null;
  warehouse: WarehouseOption | null;
  files: Array<{
    id: string;
    originalName: string | null;
    mimeType: string | null;
  }>;
  itemCount: number;
  unitCount: number;
};

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? `${error.status}: ${error.message}`
    : error instanceof Error
      ? error.message
      : "No se pudo completar el traslado.";

export default function ProviderPickupsPage() {
  const [providers, setProviders] = useState<WarehouseOption[]>([]);
  const [destinations, setDestinations] = useState<WarehouseOption[]>([]);
  const [providerWarehouseId, setProviderWarehouseId] = useState<string | null>(
    null,
  );
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<
    string | null
  >(null);
  const [stock, setStock] = useState<ProviderStockItem[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [providerDocument, setProviderDocument] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<RecentPickup[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingStock, setLoadingStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    setRecent(await api<RecentPickup[]>("/provider-pickups/recent"));
  }, []);

  const loadStock = useCallback(async (providerId: string) => {
    setLoadingStock(true);
    try {
      const items = await api<ProviderStockItem[]>(
        `/provider-pickups/stock?providerWarehouseId=${encodeURIComponent(providerId)}`,
      );
      setStock(items);
      setSelected({});
    } finally {
      setLoadingStock(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingInitial(true);
      setError(null);
      try {
        const [options, recentItems] = await Promise.all([
          api<{
            providers: WarehouseOption[];
            destinations: WarehouseOption[];
          }>("/provider-pickups/options"),
          api<RecentPickup[]>("/provider-pickups/recent"),
        ]);
        if (!active) return;
        setProviders(options.providers);
        setDestinations(options.destinations);
        setRecent(recentItems);
        const preferredDestination =
          options.destinations.find((warehouse) =>
            /principal/i.test(warehouse.name),
          ) ?? options.destinations[0];
        setDestinationWarehouseId(preferredDestination?.id ?? null);
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoadingInitial(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!providerWarehouseId) {
      setStock([]);
      setSelected({});
      return;
    }
    setError(null);
    void loadStock(providerWarehouseId).catch((loadError) => {
      setError(errorMessage(loadError));
    });
  }, [loadStock, providerWarehouseId]);

  const filteredStock = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    if (!term) return stock;
    return stock.filter((item) =>
      [item.name, item.family, item.subfamily, item.reference]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es").includes(term)),
    );
  }, [search, stock]);

  const selectedItems = useMemo(
    () => stock.filter((item) => (selected[item.key] ?? 0) > 0),
    [selected, stock],
  );
  const selectedUnits = useMemo(
    () =>
      selectedItems.reduce((sum, item) => sum + (selected[item.key] ?? 0), 0),
    [selected, selectedItems],
  );

  const provider =
    providers.find((item) => item.id === providerWarehouseId) ?? null;
  const destination =
    destinations.find((item) => item.id === destinationWarehouseId) ?? null;

  const refresh = async () => {
    setError(null);
    try {
      await Promise.all([
        providerWarehouseId
          ? loadStock(providerWarehouseId)
          : Promise.resolve(),
        loadRecent(),
      ]);
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    }
  };

  const submit = async () => {
    if (!providerWarehouseId)
      return setError("Selecciona la bodega del proveedor.");
    if (!destinationWarehouseId)
      return setError("Selecciona la bodega REV que recibirá los equipos.");
    if (!selectedItems.length)
      return setError("Selecciona al menos un equipo o referencia.");
    if (!providerDocument)
      return setError(
        "Adjunta la foto o PDF del documento entregado por el proveedor.",
      );

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const draft = await api<{ id: string; consecutive: string }>(
        "/provider-pickups",
        {
          method: "POST",
          json: {
            providerWarehouseId,
            destinationWarehouseId,
            notes: notes.trim() || undefined,
            items: selectedItems.map((item) => ({
              skuId: item.skuId ?? undefined,
              assetId: item.assetId ?? undefined,
              quantity: selected[item.key],
            })),
          },
        },
      );
      const body = new FormData();
      body.append("category", "COMPROBANTE_SALIDA_PROVEEDOR");
      body.append(
        "displayName",
        `Documento de salida de ${provider?.name ?? "proveedor"}`,
      );
      body.append("providerWarehouseId", providerWarehouseId);
      body.append("files", providerDocument);
      await api(`/files/entities/DOCUMENT/${draft.id}`, {
        method: "POST",
        body,
      });
      await api(`/provider-pickups/${draft.id}/confirm`, { method: "POST" });

      setMessage(
        `${draft.consecutive} confirmado: ${selectedUnits} unidades trasladadas de ${provider?.name} a ${destination?.name}, conservando al proveedor como dueño.`,
      );
      setSelected({});
      setProviderDocument(null);
      setNotes("");
      await Promise.all([loadStock(providerWarehouseId), loadRecent()]);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="lg" py="lg">
      <Group justify="space-between" align="flex-start" mb="lg">
        <div>
          <Title order={2}>Recogidas en proveedor</Title>
          <Text c="dimmed">
            Traslada inventario del proveedor a una bodega REV sin cambiar su
            propietario.
          </Text>
        </div>
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          loading={loadingInitial || loadingStock}
          onClick={() => void refresh()}
        >
          Actualizar
        </Button>
      </Group>

      {error ? (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert color="green" mb="md">
          {message}
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p={{ base: "md", md: "lg" }} mb="lg">
        <Title order={3} mb="xs">
          1. Define el traslado
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          El origen pierde la custodia física; el destino recibe la custodia. La
          propiedad permanece en el proveedor.
        </Text>
        <Group grow align="flex-start">
          <Select
            searchable
            required
            label="Bodega del proveedor"
            placeholder="Selecciona el origen"
            leftSection={<IconBuildingWarehouse size={16} />}
            data={providers.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            value={providerWarehouseId}
            onChange={setProviderWarehouseId}
          />
          <Select
            searchable
            required
            label="Bodega REV de destino"
            placeholder="Selecciona el destino"
            leftSection={<IconTruckLoading size={16} />}
            data={destinations.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            value={destinationWarehouseId}
            onChange={setDestinationWarehouseId}
          />
        </Group>
      </Paper>

      <Paper withBorder radius="md" p={{ base: "md", md: "lg" }} mb="lg">
        <Group justify="space-between" align="flex-end" mb="md">
          <div>
            <Title order={3}>2. Selecciona el inventario</Title>
            <Text size="sm" c="dimmed">
              Solo aparecen existencias físicamente disponibles en la bodega
              seleccionada.
            </Text>
          </div>
          <TextInput
            w={{ base: "100%", sm: 300 }}
            placeholder="Buscar referencia"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </Group>

        {!providerWarehouseId ? (
          <Alert color="blue">
            Selecciona primero la bodega del proveedor.
          </Alert>
        ) : filteredStock.length === 0 && !loadingStock ? (
          <Alert color="gray">
            No hay inventario disponible con ese criterio.
          </Alert>
        ) : (
          <Stack gap="xs">
            {filteredStock.map((item) => {
              const quantity = selected[item.key] ?? 0;
              return (
                <Paper key={item.key} withBorder radius="sm" p="sm">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Checkbox
                      checked={quantity > 0}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [item.key]: event.currentTarget.checked
                            ? item.type === "SERIAL"
                              ? 1
                              : item.availableQuantity
                            : 0,
                        }))
                      }
                      label={
                        <div>
                          <Group gap="xs">
                            <Text fw={650}>{item.name}</Text>
                            <Badge size="sm" variant="light">
                              {item.type === "BULK" ? "Cantidad" : "Serial"}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {[item.family, item.subfamily, item.reference]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Disponible: {item.availableQuantity}
                          </Text>
                        </div>
                      }
                    />
                    {item.type === "BULK" && quantity > 0 ? (
                      <NumberInput
                        w={110}
                        min={1}
                        max={item.availableQuantity}
                        value={quantity}
                        onChange={(value) =>
                          setSelected((current) => ({
                            ...current,
                            [item.key]: Math.min(
                              Number(value) || 0,
                              item.availableQuantity,
                            ),
                          }))
                        }
                      />
                    ) : null}
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Paper>

      <Paper withBorder radius="md" p={{ base: "md", md: "lg" }} mb="xl">
        <Title order={3} mb="md">
          3. Adjunta y confirma
        </Title>
        <Stack>
          <FileInput
            required
            clearable
            accept="image/png,image/jpeg,image/webp,application/pdf"
            leftSection={<IconCamera size={16} />}
            label="Documento físico del proveedor"
            description="Sube una foto legible o el PDF entregado al retirar los equipos."
            value={providerDocument}
            onChange={setProviderDocument}
          />
          <Textarea
            label="Observaciones"
            placeholder="Conductor, placa, número del documento físico u otra novedad"
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <Paper bg="gray.0" radius="sm" p="md">
            <Group justify="space-between">
              <div>
                <Text fw={700}>
                  {selectedItems.length} referencias · {selectedUnits} unidades
                </Text>
                <Text size="sm" c="dimmed">
                  {provider?.name ?? "Proveedor"} →{" "}
                  {destination?.name ?? "Bodega REV"}
                </Text>
              </div>
              <Badge color="violet" variant="light">
                Dueño: {provider?.name ?? "Proveedor"}
              </Badge>
            </Group>
          </Paper>
          <Button
            size="md"
            leftSection={<IconCheck size={18} />}
            loading={submitting}
            onClick={() => void submit()}
          >
            Confirmar recogida y trasladar inventario
          </Button>
        </Stack>
      </Paper>

      <Title order={3} mb="md">
        Traslados recientes
      </Title>
      <Stack gap="sm">
        {recent.length === 0 ? (
          <Paper withBorder radius="md" p="lg">
            <Text c="dimmed">Todavía no hay recogidas registradas.</Text>
          </Paper>
        ) : (
          recent.map((item) => (
            <Paper key={item.id} withBorder radius="md" p="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Group gap="xs">
                    <Text fw={750}>
                      {item.consecutive ?? "Sin consecutivo"}
                    </Text>
                    <Badge
                      color={item.status === "CONFIRMED" ? "green" : "yellow"}
                      variant="light"
                    >
                      {item.status === "CONFIRMED" ? "Confirmado" : "Borrador"}
                    </Badge>
                  </Group>
                  <Text size="sm">
                    {item.providerWarehouse?.name ?? "Proveedor"} →{" "}
                    {item.warehouse?.name ?? "Bodega REV"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {dateFormatter.format(new Date(item.docDate))} ·{" "}
                    {item.itemCount} referencias · {item.unitCount} unidades
                  </Text>
                </div>
                <Text size="xs" c="dimmed" ta="right">
                  {item.files[0]?.originalName ?? "Sin comprobante"}
                </Text>
              </Group>
            </Paper>
          ))
        )}
      </Stack>
    </Container>
  );
}
