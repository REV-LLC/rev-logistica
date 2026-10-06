"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Alert, NumberInput, Paper, Select, Stack, Text } from "@mantine/core";
import InventoryItemPickerModal, {
  type InventoryItemPickerModalProps,
} from "../InventoryItemPickerModal";
import { api } from "@/lib/api";
import { bulkKitName, type BulkKitFamily } from "../bulk-kits/types";
import {
  addBulkKitPieces,
  kitSourceKey,
  type KitPiece,
} from "./bulk-kit-selection";
import type { SelectedItem } from "./request-types";

export default function RemissionKitPicker({
  selectedItems,
  setSelectedItems,
  ...picker
}: InventoryItemPickerModalProps & {
  selectedItems: SelectedItem[];
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
}) {
  const [families, setFamilies] = useState<BulkKitFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string | number>(1);
  const [sources, setSources] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    api<BulkKitFamily[]>("/bulk-kits")
      .then((data) => {
        if (!cancelled) setFamilies(data);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar los conjuntos.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const kits = families.flatMap((family) =>
    family.bulkKits.map((kit) => ({
      ...kit,
      label: `${bulkKitName(family, kit)} · ${family.name}`,
    })),
  );
  const kit = kits.find((item) => item.id === kitId);
  const pieces: KitPiece[] =
    kit?.entries.map((entry) => ({
      skuId: entry.skuId,
      quantity: entry.quantity,
      name: entry.sku.name,
      sourceKey: sources[entry.skuId] ?? undefined,
    })) ?? [];
  let validationError: string | null = null;
  if (kit) {
    try {
      addBulkKitPieces(
        selectedItems,
        pieces,
        Number(quantity),
        picker.bulkItems,
        () => "validation-only",
      );
    } catch (err) {
      validationError =
        err instanceof Error ? err.message : "Revisa las piezas.";
    }
  }
  return (
    <InventoryItemPickerModal
      {...picker}
      extraTab={{
        label: "Conjuntos",
        selectedCount: kit ? 1 : 0,
        canConfirm: !kit || !validationError,
        exclusive: Boolean(kit),
        content: (
          <Stack>
            {loadError ? <Alert color="red">{loadError}</Alert> : null}
            <Select
              label="Conjunto"
              placeholder={loading ? "Cargando..." : "Seleccionar conjunto"}
              searchable
              clearable
              data={kits.map((item) => ({ value: item.id, label: item.label }))}
              value={kitId}
              onChange={(value) => {
                setKitId(value);
                setSources({});
                setQuantity(1);
              }}
              disabled={loading}
              nothingFoundMessage="No hay conjuntos configurados"
            />
            {kit ? (
              <>
                <NumberInput
                  label="Cantidad de conjuntos"
                  min={1}
                  max={10000}
                  allowDecimal={false}
                  allowNegative={false}
                  value={quantity}
                  onChange={setQuantity}
                />
                {pieces.map((piece) => {
                  const options = picker.bulkItems.filter(
                    (item) =>
                      item.skuId === piece.skuId &&
                      item.ownerWarehouseId &&
                      Number.isFinite(item.quantity) &&
                      item.quantity > 0,
                  );
                  return (
                    <Paper key={piece.skuId} withBorder p="sm" radius="md">
                      <Stack gap={4}>
                        <Text fw={600}>{piece.name}</Text>
                        <Text size="sm">
                          {piece.quantity} por conjunto ·{" "}
                          {piece.quantity * Number(quantity) || 0} para agregar
                        </Text>
                        {options.length > 1 ? (
                          <Select
                            label="Procedencia"
                            placeholder="Seleccionar bodega / propietario"
                            data={options.map((item) => ({
                              value: kitSourceKey(item),
                              label: `${item.ownerWarehouseName ?? "Propietario"} · ${item.quantity} disponibles`,
                            }))}
                            value={sources[piece.skuId] ?? null}
                            onChange={(value) =>
                              setSources((current) => ({
                                ...current,
                                [piece.skuId]: value,
                              }))
                            }
                          />
                        ) : (
                          <Text size="sm" c="dimmed">
                            {options[0]
                              ? `${options[0].ownerWarehouseName ?? "Inventario seleccionado"} · ${options[0].quantity} disponibles`
                              : "Sin existencias en el inventario seleccionado"}
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
                {validationError ? (
                  <Alert color="orange" role="alert">
                    {validationError}
                  </Alert>
                ) : (
                  <Text size="sm" c="dimmed">
                    Se agregarán las piezas; puedes revisar sus cantidades en el
                    documento.
                  </Text>
                )}
              </>
            ) : null}
          </Stack>
        ),
        onConfirm: () => {
          if (!kit || validationError) return 0;
          setSelectedItems((current) =>
            addBulkKitPieces(
              current,
              pieces,
              Number(quantity),
              picker.bulkItems,
              () => crypto.randomUUID(),
            ),
          );
          return pieces.length;
        },
      }}
    />
  );
}
