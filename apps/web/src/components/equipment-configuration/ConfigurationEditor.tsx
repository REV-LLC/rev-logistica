"use client";
import { useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCheck,
  IconLink,
  IconPlus,
  IconSettings,
  IconTool,
} from "@tabler/icons-react";
import ExistingPartPicker from "./ExistingPartPicker";
import ConfigurationEntryOptions from "./ConfigurationEntryOptions";
import {
  type ConfigurationEntry,
  type EquipmentConfiguration,
  type PartRole,
  entryName,
} from "./types";
import classes from "./ConfigurationEditor.module.css";

type Props = {
  value: EquipmentConfiguration;
  onChange: (value: EquipmentConfiguration) => void;
  disabled?: boolean;
  canCreate?: boolean;
  accessoryParent?: boolean;
  onConfigurePart?: (rowId: string) => void;
};

export default function ConfigurationEditor({
  value,
  onChange,
  disabled,
  canCreate = true,
  accessoryParent = false,
  onConfigurePart,
}: Props) {
  const [picker, setPicker] = useState<PartRole | null>(null);
  const [adding, setAdding] = useState<PartRole | null>(null);
  const [editing, setEditing] = useState<ConfigurationEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const atLimit = value.entries.length >= 100;
  // Families describe choices, never a second physical piece.
  const habitual = value.entries.filter(
    (row) => !row.familyId && (row.defaultIncluded || row.required),
  );
  const optional = value.entries.filter((row) => !habitual.includes(row));
  function create(role: PartRole) {
    setAdding(null);
    setCreating(true);
    setEditing({
      id: crypto.randomUUID(),
      role,
      quantity: 1,
      defaultIncluded: role === "COMPONENT",
      required: false,
      newPart: {
        name: "",
        kind: "INDIVIDUAL",
        initialQuantity: 1,
        exclusive: role === "COMPONENT" && !accessoryParent,
        compatibility: "PARENT",
      },
    });
  }
  function apply(row: ConfigurationEntry) {
    onChange({
      ...value,
      entries: creating
        ? [...value.entries, row]
        : value.entries.map((item) => (item.id === row.id ? row : item)),
    });
    setEditing(null);
    setCreating(false);
  }
  return (
    <Stack gap="xl">
      <section aria-label="Sale normalmente con">
        <Text component="h2" className={classes.heading}>
          Sale normalmente con
        </Text>
        <Stack gap="sm" mt="md">
          {habitual.map((row) => (
            <ConfigurationRow
              key={row.id}
              row={row}
              disabled={disabled}
              onEdit={() => {
                setCreating(false);
                setEditing(row);
              }}
            />
          ))}
          {!habitual.length ? (
            <Text size="sm" c="dimmed">
              Aún no hay elementos predeterminados.
            </Text>
          ) : null}
        </Stack>
      </section>
      <Divider />
      <section aria-label="Otros implementos compatibles">
        <Group justify="space-between" gap="sm" mb="md">
          <Text component="h2" className={classes.heading}>
            Otros implementos compatibles
          </Text>
          <Button
            variant="default"
            leftSection={<IconPlus size={17} />}
            disabled={disabled || atLimit}
            onClick={() => setAdding("ACCESSORY")}
          >
            Vincular implemento
          </Button>
        </Group>
        <Stack gap="sm">
          {optional.map((row) => (
            <ConfigurationRow
              key={row.id}
              row={row}
              disabled={disabled}
              onEdit={() => {
                setCreating(false);
                setEditing(row);
              }}
            />
          ))}
          {!optional.length ? (
            <Text size="sm" c="dimmed">
              Sin otros implementos vinculados.
            </Text>
          ) : null}
        </Stack>
      </section>
      <Group>
        <Button
          variant="subtle"
          leftSection={<IconPlus size={18} />}
          disabled={disabled || atLimit}
          onClick={() => setAdding("COMPONENT")}
        >
          Agregar componente
        </Button>
      </Group>
      <details className={classes.notes}>
        <summary>Notas</summary>
        <TextInput
          aria-label="Notas de configuración"
          placeholder="Nota opcional"
          mt="sm"
          maxLength={1000}
          value={value.notes ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, notes: event.currentTarget.value })
          }
        />
      </details>
      <Modal
        opened={!!adding}
        onClose={() => setAdding(null)}
        title={
          adding === "COMPONENT" ? "Agregar componente" : "Vincular implemento"
        }
        centered
      >
        <Stack>
          <Button
            variant="default"
            disabled={disabled || atLimit}
            onClick={() => {
              setPicker(adding);
              setAdding(null);
            }}
          >
            Elegir del inventario
          </Button>
          <Button
            disabled={disabled || !canCreate || atLimit}
            onClick={() => adding && create(adding)}
          >
            Crear nuevo
          </Button>
          {!canCreate ? (
            <Text size="sm" c="dimmed">
              Para crear existencias, el equipo debe estar en bodega.
            </Text>
          ) : null}
        </Stack>
      </Modal>
      <Modal
        opened={!!picker}
        onClose={() => setPicker(null)}
        title="Elegir del inventario"
        size="lg"
        centered
      >
        {picker ? (
          <ExistingPartPicker
            role={picker}
            onSelect={(entry) => {
              if (
                !value.entries.some(
                  (row) =>
                    (entry.assetId && entry.assetId === row.assetId) ||
                    (entry.familyId && entry.familyId === row.familyId) ||
                    (entry.accessoryId &&
                      entry.accessoryId === row.accessoryId),
                )
              ) {
                setCreating(true);
                setEditing(entry);
              }
              setPicker(null);
            }}
          />
        ) : null}
      </Modal>
      {editing ? (
        <ConfigurationEntryOptions
          key={editing.id}
          entry={editing}
          creating={creating}
          disabled={disabled}
          accessoryParent={accessoryParent}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onApply={apply}
          onRemove={() => {
            onChange({
              ...value,
              entries: value.entries.filter((row) => row.id !== editing.id),
            });
            setEditing(null);
          }}
          onConfigurePart={
            onConfigurePart
              ? () => {
                  setEditing(null);
                  onConfigurePart(editing.id);
                }
              : undefined
          }
        />
      ) : null}
    </Stack>
  );
}

function ConfigurationRow({
  row,
  disabled,
  onEdit,
}: {
  row: ConfigurationEntry;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const family = !!row.familyId;
  const summary = family
    ? row.required
      ? "Debe acompañar al equipo · Familia compatible"
      : "Familia compatible · Opcional en la entrega"
    : row.required
      ? "Siempre acompaña al equipo"
      : row.defaultIncluded
        ? "Se agrega a la entrega"
        : "Opcional en la entrega";
  return (
    <div className={`${classes.row} ${family ? classes.family : ""}`}>
      <div className={classes.icon} aria-hidden="true">
        {family ? <IconLink size={23} /> : <IconTool size={26} />}
      </div>
      <div className={classes.description}>
        <Text fw={600} className={classes.name}>
          {entryName(row)}
        </Text>
        <Text size="sm" c="dimmed">
          {summary}
          {row.quantity > 1 ? ` · ${row.quantity} unidades` : ""}
        </Text>
      </div>
      {row.defaultIncluded ? (
        <span className={classes.included} aria-label="Incluido por defecto">
          <IconCheck size={20} />
        </span>
      ) : null}
      <ActionIcon
        size="lg"
        variant="default"
        disabled={disabled}
        aria-label={`Configurar ${entryName(row)}`}
        onClick={onEdit}
      >
        <IconSettings size={20} />
      </ActionIcon>
    </div>
  );
}
