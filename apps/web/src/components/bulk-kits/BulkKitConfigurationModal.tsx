"use client";
import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api } from "@/lib/api";
import { bulkKitName, type BulkKitFamily } from "./types";

type Row = { key: string; skuId: string | null; quantity: number | string };
type Sku = {
  id: string;
  name: string;
  active: boolean;
  assetFamily: { name: string };
};
const newRow = (): Row => ({
  key: crypto.randomUUID(),
  skuId: null,
  quantity: 1,
});

export default function BulkKitConfigurationModal({
  familyId,
  onClose,
  onSaved,
}: {
  familyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [family, setFamily] = useState<BulkKitFamily | null>(null);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [kitId, setKitId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<BulkKitFamily>(`/bulk-kits/families/${familyId}`),
      api<Sku[]>("/skus?controlType=BULK"),
    ])
      .then(([data, catalog]) => {
        if (cancelled) return;
        setFamily(data);
        setEnabled(Boolean(data.bulkKitsEnabled));
        setPrefix(data.bulkKitPrefix ?? "");
        setSkus(catalog.filter((sku) => sku.active !== false));
        setRows([newRow()]);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "No se pudo cargar.");
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);
  const chooseKit = (id: string | null) => {
    const kit = family?.bulkKits.find((value) => value.id === id);
    setKitId(kit?.id ?? null);
    setReference(kit?.reference ?? "");
    setActive(kit?.active ?? true);
    setRows(
      kit
        ? kit.entries.map((entry) => ({
            key: crypto.randomUUID(),
            skuId: entry.skuId,
            quantity: entry.quantity,
          }))
        : [newRow()],
    );
    setError(null);
    setNotice(null);
  };
  const saveSettings = async () => {
    if (!family) return;
    if (enabled && !prefix.trim()) {
      setError("Ingresa el texto inicial de los conjuntos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api<BulkKitFamily>(
        `/bulk-kits/families/${familyId}/settings`,
        {
          method: "PUT",
          json: { enabled, prefix, version: family.bulkKitSettingsVersion },
        },
      );
      setFamily(data);
      setPrefix(data.bulkKitPrefix ?? "");
      setSettingsOpen(false);
      setNotice("Configuración guardada.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };
  const saveKit = async () => {
    if (!family) return;
    setError(null);
    setNotice(null);
    if (!reference.trim()) {
      setError("Ingresa la referencia del conjunto.");
      return;
    }
    if (
      !rows.length ||
      rows.some(
        (row) =>
          !row.skuId ||
          !Number.isInteger(Number(row.quantity)) ||
          Number(row.quantity) < 1 ||
          Number(row.quantity) > 1000000,
      )
    ) {
      setError("Selecciona las piezas y sus cantidades enteras positivas.");
      return;
    }
    if (new Set(rows.map((row) => row.skuId)).size !== rows.length) {
      setError("No repitas una pieza. Ajusta su cantidad.");
      return;
    }
    setSaving(true);
    try {
      const kit = family.bulkKits.find((item) => item.id === kitId);
      await api(
        `/bulk-kits/families/${familyId}/kits${kitId ? `/${kitId}` : ""}`,
        {
          method: kitId ? "PUT" : "POST",
          json: {
            reference,
            active,
            version: kit?.version ?? 0,
            entries: rows.map((row) => ({
              skuId: row.skuId,
              quantity: Number(row.quantity),
            })),
          },
        },
      );
      setFamily(await api<BulkKitFamily>(`/bulk-kits/families/${familyId}`));
      chooseKit(null);
      setNotice("Conjunto guardado.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };
  const settingsDirty =
    Boolean(family) &&
    (enabled !== Boolean(family?.bulkKitsEnabled) ||
      prefix !== (family?.bulkKitPrefix ?? ""));
  return (
    <Modal
      opened
      onClose={saving ? () => {} : onClose}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      title={`Configurar conjunto · ${family?.name ?? "BULK"}`}
      size="lg"
    >
      <Stack>
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert color="green" role="status">
            {notice}
          </Alert>
        ) : null}
        {!family ? (
          <Loader size="sm" />
        ) : (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Plantillas de piezas, sin stock adicional.
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => setSettingsOpen((value) => !value)}
                disabled={saving}
              >
                Configuración familiar
              </Button>
            </Group>
            {settingsOpen || !family.bulkKitsEnabled ? (
              <Paper withBorder p="sm" radius="md">
                <Stack gap="sm">
                  <Checkbox
                    label="Habilitar conjuntos para esta familia"
                    checked={enabled}
                    onChange={(event) =>
                      setEnabled(event.currentTarget.checked)
                    }
                    disabled={saving}
                  />
                  {enabled ? (
                    <TextInput
                      label="Texto inicial de los conjuntos"
                      placeholder="Ej. Andamio colgante de"
                      value={prefix}
                      onChange={(event) => setPrefix(event.currentTarget.value)}
                      maxLength={100}
                      required
                      disabled={saving}
                    />
                  ) : null}
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      onClick={saveSettings}
                      loading={saving}
                      disabled={!settingsDirty}
                    >
                      Guardar configuración
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            ) : null}
            {family.bulkKitsEnabled ? (
              <>
                <Select
                  label="Conjunto"
                  placeholder="Crear conjunto nuevo"
                  clearable
                  value={kitId}
                  data={family.bulkKits.map((kit) => ({
                    value: kit.id,
                    label: `${bulkKitName(family, kit)}${kit.active ? "" : " · Archivado"}`,
                  }))}
                  onChange={chooseKit}
                  disabled={saving}
                />
                <Paper withBorder radius="md" p="sm">
                  <Stack gap="xs">
                    <Badge
                      variant="light"
                      style={{
                        whiteSpace: "normal",
                        height: "auto",
                        maxWidth: "100%",
                        padding: 8,
                      }}
                    >
                      {family.bulkKitPrefix}
                    </Badge>
                    <TextInput
                      label="Referencia del conjunto"
                      placeholder="Ej. 2 m"
                      value={reference}
                      onChange={(event) =>
                        setReference(event.currentTarget.value)
                      }
                      maxLength={100}
                      required
                      disabled={saving}
                    />
                    {reference.trim() ? (
                      <Text size="sm">
                        {bulkKitName(family, { reference })}
                      </Text>
                    ) : null}
                  </Stack>
                </Paper>
                <Text fw={600}>Piezas para un conjunto</Text>
                {rows.map((row, index) => (
                  <Paper key={row.key} withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Select
                        label={`Pieza ${index + 1}`}
                        searchable
                        placeholder="Seleccionar referencia"
                        value={row.skuId}
                        data={skus.map((sku) => ({
                          value: sku.id,
                          label: `${sku.name} · ${sku.assetFamily.name}`,
                          disabled: rows.some(
                            (other) =>
                              other.key !== row.key && other.skuId === sku.id,
                          ),
                        }))}
                        onChange={(value) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, skuId: value }
                                : item,
                            ),
                          )
                        }
                        disabled={saving}
                        nothingFoundMessage="Sin coincidencias"
                      />
                      <Group
                        align="flex-end"
                        wrap="nowrap"
                        style={{ flexDirection: "row" }}
                      >
                        <NumberInput
                          label="Cantidad"
                          min={1}
                          max={1000000}
                          allowDecimal={false}
                          allowNegative={false}
                          value={row.quantity}
                          onChange={(value) =>
                            setRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? { ...item, quantity: value }
                                  : item,
                              ),
                            )
                          }
                          disabled={saving}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <ActionIcon
                          size="lg"
                          variant="light"
                          color="red"
                          style={{
                            width: 36,
                            minWidth: 36,
                            maxWidth: 36,
                            flex: "0 0 36px",
                          }}
                          aria-label={`Quitar pieza ${index + 1}`}
                          onClick={() =>
                            setRows((current) =>
                              current.filter((item) => item.key !== row.key),
                            )
                          }
                          disabled={saving}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Paper>
                ))}
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setRows((current) => [...current, newRow()])}
                  disabled={saving || rows.length >= 100}
                >
                  Agregar pieza
                </Button>
                {kitId ? (
                  <Checkbox
                    label="Disponible en documentos"
                    checked={active}
                    onChange={(event) => setActive(event.currentTarget.checked)}
                    disabled={saving}
                  />
                ) : null}
              </>
            ) : null}
            <Group justify="center" grow wrap="wrap">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button
                onClick={saveKit}
                loading={saving}
                disabled={!family.bulkKitsEnabled || settingsDirty}
              >
                Guardar conjunto
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
