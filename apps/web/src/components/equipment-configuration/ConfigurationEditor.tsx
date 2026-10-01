"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSettings } from '@tabler/icons-react';
import ExistingPartPicker from "./ExistingPartPicker";
import {
  type ConfigurationEntry,
  type EquipmentConfiguration,
  type PartRole,
  entryName,
  configurationPartAction,
  partRoleLabels,
} from "./types";

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
  const update = (id: string, changes: Partial<ConfigurationEntry>) =>
    onChange({
      ...value,
      entries: value.entries.map((row) =>
        row.id === id ? { ...row, ...changes } : row,
      ),
    });
  const create = (role: PartRole) =>
    onChange({
      ...value,
      entries: [
        ...value.entries,
        {
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
        },
      ],
    });
  return (
    <Stack gap="lg">
      <TextInput label="Notas de configuración" placeholder="Opcional"
        maxLength={1000} value={value.notes ?? ''} disabled={disabled}
        onChange={event => onChange({ ...value, notes: event.currentTarget.value })} />
      {(["COMPONENT", "ACCESSORY"] as const).map((role) => (
        <Stack key={role} gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={700}>
                {role === "COMPONENT"
                  ? "Componentes del equipo"
                  : "Accesorios de trabajo"}
              </Text>
            </div>
            <Group>
              <Button
                type="button"
                variant="light"
                disabled={disabled || !canCreate || value.entries.length >= 100}
                onClick={() => create(role)}
              >
                Crear {partRoleLabels[role].toLowerCase()}
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={disabled || value.entries.length >= 100}
                onClick={() => setPicker(role)}
              >
                Vincular existente
              </Button>
            </Group>
          </Group>
          {!value.entries.some((row) => row.role === role) ? (
            <Text size="sm" c="dimmed">
              Sin{" "}
              {role === "COMPONENT"
                ? "componentes adicionales"
                : "accesorios configurados"}
              .
            </Text>
          ) : null}
          {value.entries
            .filter((row) => row.role === role)
            .map((row) => (
              <Card component="details" open={!!row.newPart} withBorder key={row.id}>
                <summary style={{ cursor: 'pointer', display: 'block' }}>
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text component="span" fw={600}>{row.newPart && !row.newPart.name ? `Nuevo ${partRoleLabels[role].toLowerCase()}` : entryName(row)}</Text>
                      <Group gap={4} mt={4}>
                        {row.newPart ? <Badge size="xs">Nuevo</Badge> : null}
                        {row.quantity > 1 ? <Badge size="xs" variant="light">× {row.quantity}</Badge> : null}
                        {row.defaultIncluded ? <Badge size="xs" variant="light">Predeterminado</Badge> : null}
                        {row.required ? <Badge size="xs" color="orange" variant="light">Requerido</Badge> : null}
                        {row.familyId ? <Badge size="xs" color="gray" variant="light">Elegir unidad</Badge> : null}
                      </Group>
                    </div>
                    <IconSettings size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
                  </Group>
                </summary>
                <Stack gap="sm" mt="sm">
                  {row.newPart ? (
                    <>
                      <TextInput
                        label={`Nombre del ${partRoleLabels[role].toLowerCase()}`}
                        required
                        maxLength={160}
                        value={row.newPart.name}
                        disabled={disabled}
                        onChange={(e) =>
                          update(row.id, {
                            newPart: {
                              ...row.newPart!,
                              name: e.currentTarget.value,
                            },
                          })
                        }
                      />
                      {role === "ACCESSORY" ? (
                        <Select
                          label="Control del accesorio"
                          allowDeselect={false}
                          value={row.newPart.kind}
                          disabled={disabled}
                          data={[
                            {
                              value: "INDIVIDUAL",
                              label: "Individualizado y retornable",
                            },
                            {
                              value: "RETURNABLE",
                              label: "Por cantidad y retornable",
                            },
                            {
                              value: "CONSUMABLE",
                              label: "Por cantidad y consumible",
                            },
                          ]}
                          onChange={(kind) =>
                            update(row.id, {
                              quantity: 1,
                              newPart: {
                                ...row.newPart!,
                                kind: kind as NonNullable<
                                  ConfigurationEntry["newPart"]
                                >["kind"],
                                initialQuantity: 1,
                              },
                            })
                          }
                        />
                      ) : null}
                      {row.newPart.kind === "INDIVIDUAL" ? (
                        <Text size="xs" c="dimmed">
                          Se registrará 1 unidad en bodega.
                        </Text>
                      ) : (
                        <NumberInput
                          label="Existencia inicial en bodega"
                          min={1}
                          max={1000000}
                          allowDecimal={false}
                          value={row.newPart.initialQuantity}
                          disabled={disabled}
                          onChange={(v) =>
                            update(row.id, {
                              newPart: {
                                ...row.newPart!,
                                initialQuantity: Number(v),
                              },
                            })
                          }
                        />
                      )}
                      <Text size="xs" c="dimmed">Al guardar, ingresa esta existencia a nombre del propietario del equipo.</Text>
                      {role === "COMPONENT" && !accessoryParent ? (
                        <Checkbox
                          label="Exclusivo de este equipo (no intercambiable)"
                          checked={row.newPart.exclusive}
                          disabled={disabled}
                          onChange={(e) =>
                            update(row.id, {
                              newPart: {
                                ...row.newPart!,
                                exclusive: e.currentTarget.checked,
                                compatibility: "PARENT",
                              },
                            })
                          }
                        />
                      ) : null}
                      {!accessoryParent ? (
                        <Select
                          label="Compatibilidad"
                          value={row.newPart.compatibility ?? "PARENT"}
                          allowDeselect={false}
                          disabled={disabled || row.newPart.exclusive}
                          data={[
                            { value: "PARENT", label: "Solo este equipo" },
                            { value: "SUBFAMILY", label: "Toda su subfamilia" },
                            { value: "FAMILY", label: "Toda su familia" },
                          ]}
                          onChange={(v) =>
                            update(row.id, {
                              newPart: {
                                ...row.newPart!,
                                compatibility: v as
                                  | "PARENT"
                                  | "SUBFAMILY"
                                  | "FAMILY",
                              },
                            })
                          }
                        />
                      ) : (
                        <Text size="xs" c="dimmed">
                          Compatible con este accesorio principal.
                        </Text>
                      )}
                    </>
                  ) : (
                    row.familyId ? <Badge variant="light">Elegir unidad en la remisión</Badge>
                      : <Badge variant="light" color="gray">{row.accessory?.exclusiveAssetId ? "Exclusivo" : row.accessory?.kind === "CONSUMABLE" ? "Consumible" : row.accessory?.kind === "RETURNABLE" ? "Por cantidad" : "Individual"}</Badge>
                  )}
                  {onConfigurePart && configurationPartAction(row) ? <Button
                    type="button" variant="light" size="xs" disabled={disabled}
                    onClick={() => onConfigurePart(row.id)}
                  >{row.newPart ? `Guardar y ${configurationPartAction(row)!.toLowerCase()}` : configurationPartAction(row)}</Button>
                    : row.assetId || row.accessoryId ? <Button
                    component="a"
                    href={`/inventory/equipment-configuration/${row.assetId ? `assets/${row.assetId}` : `accessories/${row.accessoryId}`}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="light"
                    size="xs"
                  >{configurationPartAction(row)} ↗</Button> : null}
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <NumberInput
                    label="Cantidad habitual"
                    min={1}
                    max={
                      row.assetId ||
                      row.newPart?.kind === "INDIVIDUAL" ||
                      row.accessory?.kind === "INDIVIDUAL"
                        ? 1
                        : 1000000
                    }
                    allowDecimal={false}
                    disabled={disabled}
                    value={row.quantity}
                    onChange={(v) => update(row.id, { quantity: Number(v) })}
                  />
                  <NumberInput label="Cantidad máxima (opcional)" min={row.quantity} allowDecimal={false}
                    disabled={disabled} value={row.maximumQuantity ?? ''}
                    onChange={value => update(row.id, { maximumQuantity: typeof value === 'number' ? value : null })} />
                  <Checkbox
                    label="Incluido por defecto"
                    checked={row.defaultIncluded}
                    disabled={disabled || !!row.familyId}
                    onChange={(e) =>
                      update(row.id, {
                        defaultIncluded: e.currentTarget.checked,
                      })
                    }
                  />
                  <Checkbox
                    label="Requerido para operar"
                    checked={row.required}
                    disabled={disabled}
                    onChange={(e) =>
                      update(row.id, { required: e.currentTarget.checked })
                    }
                  />
                  </SimpleGrid>
                  <Button
                    type="button"
                    color="red"
                    variant="subtle"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        entries: value.entries.filter(
                          (item) => item.id !== row.id,
                        ),
                      })
                    }
                  >
                    Quitar del conjunto
                  </Button>
                </Stack>
              </Card>
            ))}
        </Stack>
      ))}
      <details>
        <Text component="summary" size="sm" c="dimmed" style={{ cursor: 'pointer' }}>Ayuda del conjunto</Text>
        <Stack gap="xs" mt="sm">
          <Text size="sm">Crear registra existencias iniciales. Vincular usa inventario existente, sin duplicarlo ni moverlo.</Text>
          <Text size="sm">Incluido por defecto lo propone en la remisión. Requerido para operar impide enviarlo sin esa pieza.</Text>
          <Text size="sm">Los motores intercambiables se asignan desde la ficha del equipo. Los consumibles pueden regresar; solo lo que no vuelve se registra como consumo.</Text>
          <Text size="sm">Quitar del conjunto no elimina el elemento ni su historial. Las entregas y devoluciones se hacen en Transporte.</Text>
        </Stack>
      </details>
      <Modal
        opened={!!picker}
        onClose={() => setPicker(null)}
        title="Vincular existente"
        size="lg"
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
              )
                onChange({ ...value, entries: [...value.entries, entry] });
              setPicker(null);
            }}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}
