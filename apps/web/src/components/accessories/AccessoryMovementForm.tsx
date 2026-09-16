"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { api } from "@/lib/api";
import {
  Accessory,
  allowsManualMovement,
  balanceLabel,
  compatibleWith,
  Equipment,
  equipmentLabel,
  Location,
  MovementType,
  movementLabels,
  Warehouse,
} from "./types";

export default function AccessoryMovementForm({
  item,
  equipment,
  onSaved,
  onCancel,
}: {
  item: Accessory;
  equipment?: Equipment;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<MovementType>(
    item.balances.some((b) => b.warehouseId)
      ? "ASSIGN"
      : item.balances.some(
            (balance) =>
              balance.assetId &&
              !balance.customerWorksiteId &&
              !balance.transitDocumentId,
          )
        ? "RETURN"
        : item.balances.some((balance) => balance.customerWorksiteId)
          ? item.kind === "CONSUMABLE"
            ? "CONSUME"
            : "RETIRE"
          : "RECEIVE",
  );
  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(
    equipment ? `asset:${equipment.id}` : null,
  );
  const [quantity, setQuantity] = useState<string | number>(1);
  const [note, setNote] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [assets, setAssets] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const attempt = useRef<{ body: string; requestId: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Warehouse[]>("/warehouses", { signal: controller.signal }),
      api<Equipment[]>(`/accessories/equipment?familyId=${item.familyId}`, {
        signal: controller.signal,
      }),
    ])
      .then(([warehouseList, assetList]) => {
        setWarehouses(warehouseList.filter((w) => w.active !== false));
        setAssets(assetList.filter((asset) => compatibleWith(item, asset)));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [item]);

  const needsFrom = type !== "RECEIVE";
  const needsTo = type !== "CONSUME" && type !== "RETIRE";
  const sources = item.balances.filter(
    (b) =>
      !b.transitDocumentId &&
      (!b.customerWorksiteId || type === "CONSUME" || type === "RETIRE") &&
      (type === "ASSIGN"
        ? b.warehouseId
        : type === "RETURN"
          ? b.assetId
          : true),
  );
  const selectedSource =
    sources.find((b) => b.locationKey === source) ?? sources[0];
  const targetIsAsset =
    type === "ASSIGN" || (type === "TRANSFER" && !!selectedSource?.assetId);
  const targets = (
    targetIsAsset
      ? assets.map((a) => ({
          value: `asset:${a.id}`,
          label: equipmentLabel(a),
        }))
      : warehouses.map((w) => ({ value: `warehouse:${w.id}`, label: w.name }))
  ).filter((option) => option.value !== selectedSource?.locationKey);
  const selectedTarget = targets.some((t) => t.value === target)
    ? target
    : null;
  const location = (key: string): Location =>
    key.startsWith("asset:")
      ? { assetId: key.slice(6) }
      : { warehouseId: key.slice(10) };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if ((needsFrom && !selectedSource) || (needsTo && !selectedTarget)) {
      setError("Selecciona un origen y destino válidos para este movimiento.");
      return;
    }
    if (!note.trim()) {
      setError("Indica el motivo del movimiento.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError("");
    const body = {
      type,
      quantity: item.kind === "INDIVIDUAL" ? 1 : Number(quantity),
      note: note.trim(),
      ...(needsFrom
        ? {
            from: {
              ...(selectedSource!.warehouseId
                ? { warehouseId: selectedSource!.warehouseId }
                : { assetId: selectedSource!.assetId! }),
              ...(selectedSource!.customerWorksiteId
                ? { customerWorksiteId: selectedSource!.customerWorksiteId }
                : {}),
            },
          }
        : {}),
      ...(needsTo ? { to: location(selectedTarget!) } : {}),
    };
    const signature = JSON.stringify(body);
    if (attempt.current?.body !== signature)
      attempt.current = { body: signature, requestId: crypto.randomUUID() };
    try {
      await api(`/accessories/${item.id}/movements`, {
        method: "POST",
        json: { ...body, requestId: attempt.current.requestId },
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar el movimiento.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (loading) return <Loader aria-label="Cargando ubicaciones" />;
  return (
    <form onSubmit={save}>
      <Stack>
        {item.balances.some((balance) => balance.transitDocumentId) ? (
          <Alert color="blue">
            Las existencias en tránsito solo se reciben desde Entregas a
            proveedores, con evidencia y comprobante. No están disponibles en
            bodega.
          </Alert>
        ) : null}
        {item.balances.some((balance) => balance.customerWorksiteId) ? (
          <Alert color="blue">
            Los accesorios en obra se devuelven mediante una devolución
            documental.{" "}
            {item.kind === "CONSUMABLE"
              ? "Desde aquí puedes registrar su consumo o baja."
              : "Desde aquí solo puedes registrar una baja justificada; este accesorio no es consumible."}
          </Alert>
        ) : null}
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        <Text fw={600}>
          {item.name}
          {item.internalCode ? ` · ${item.internalCode}` : ""}
        </Text>
        <fieldset
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <Stack>
            <Select
              label="Movimiento"
              allowDeselect={false}
              value={type}
              data={Object.entries(movementLabels)
                .filter(([key]) =>
                  allowsManualMovement(item.kind, key as MovementType),
                )
                .map(([value, label]) => ({ value, label }))}
              onChange={(value) => {
                setType(value as MovementType);
                setSource(null);
                setTarget(null);
              }}
            />
            {needsFrom ? (
              <Select
                label="Origen con existencias"
                required
                searchable
                value={selectedSource?.locationKey ?? null}
                data={sources.map((b) => ({
                  value: b.locationKey,
                  label: `${balanceLabel(b)} · ${b.quantity} disponible(s)`,
                }))}
                onChange={(value) => {
                  setSource(value);
                  setTarget(null);
                }}
              />
            ) : null}
            {needsTo ? (
              <Select
                label={
                  targetIsAsset
                    ? "Equipo compatible de destino"
                    : "Bodega de destino"
                }
                required
                searchable
                value={selectedTarget}
                data={targets}
                onChange={setTarget}
              />
            ) : null}
            {item.kind !== "INDIVIDUAL" ? (
              <NumberInput
                label="Cantidad (unidades)"
                required
                min={1}
                max={needsFrom ? (selectedSource?.quantity ?? 1) : 1000000}
                allowDecimal={false}
                value={quantity}
                onChange={setQuantity}
              />
            ) : null}
            <Textarea
              label="Motivo / referencia"
              placeholder="Describe la entrega, devolución o consumo"
              required
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
            <Alert
              color={
                type === "CONSUME" || type === "RETIRE" ? "orange" : "blue"
              }
            >
              {type === "CONSUME" || type === "RETIRE"
                ? "Esta operación descuenta existencias definitivamente y quedará registrada en el historial."
                : "Se registra la custodia del accesorio. Una entrega no equivale a consumo ni genera una remisión."}
            </Alert>
          </Stack>
        </fieldset>
        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Registrar movimiento
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
