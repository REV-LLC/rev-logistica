"use client";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
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
      <Alert color="blue">
        Cada relación vincula este elemento con una pieza por su identidad, no por
        el nombre de su familia. Puedes crear o vincular las piezas y después
        configurar sus propios conjuntos. La configuración no registra entregas,
        consumos ni reservas. Los elementos nuevos sí crean la existencia
        inicial indicada, en la bodega y a nombre del propietario del equipo.
      </Alert>
      <TextInput label="Notas de configuración" description="Describe las condiciones del conjunto. Estas notas no reemplazan los vínculos ni la compatibilidad."
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
              <Text size="sm" c="dimmed">
                {role === "COMPONENT"
                  ? "Piezas propias de su configuración. Los motores intercambiables se asignan desde la ficha del equipo."
                  : "Implementos compatibles, retornables o consumibles; también pueden tener accesorios propios."}
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
                Vincular {partRoleLabels[role].toLowerCase()} existente
              </Button>
            </Group>
          </Group>
          {!value.entries.some((row) => row.role === role) ? (
            <Text size="sm" c="dimmed">
              Sin{" "}
              {role === "COMPONENT"
                ? "componentes adicionales"
                : "accesorios configurados"}
              . Puedes dejarlo vacío.
            </Text>
          ) : null}
          {value.entries
            .filter((row) => row.role === role)
            .map((row) => (
              <Card withBorder key={row.id}>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text fw={600}>{entryName(row)}</Text>
                    <Badge>{row.newPart ? "Nuevo" : "Existente"}</Badge>
                  </Group>
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
                      {row.newPart.kind === "CONSUMABLE" ? (
                        <Text size="sm">
                          Puede regresar aprovechable. Solo se registra consumo
                          cuando se confirma la cantidad que no regresa.
                        </Text>
                      ) : null}
                      {row.newPart.kind === "INDIVIDUAL" ? (
                        <Text size="sm" c="dimmed">
                          Una unidad con identidad y código generado
                          automáticamente.
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
                        <Text size="sm">
                          Compatible con este accesorio principal.
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text size="sm" c="dimmed">
                      {row.accessory?.internalCode ?? row.asset?.publicCode} ·
                      Vincular no crea otra unidad ni mueve sus existencias.
                      {row.accessory?.exclusiveAssetId
                        ? " Componente exclusivo de su equipo."
                        : ""}
                    </Text>
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
                  >{configurationPartAction(row)} (otra pestaña)</Button> : row.newPart ? <Text size="sm" c="dimmed">
                    Después de crear el equipo podrás configurar el conjunto o cobro de esta pieza desde «Continuar configurando conjunto».
                  </Text> : null}
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
                  {row.familyId ? <Text size="sm">Permite elegir unidades de esta familia desde la tuerca del documento; no elige una unidad automáticamente.</Text> : null}
                  <NumberInput label="Cantidad máxima (opcional)" min={row.quantity} allowDecimal={false}
                    disabled={disabled} value={row.maximumQuantity ?? ''}
                    onChange={value => update(row.id, { maximumQuantity: typeof value === 'number' ? value : null })} />
                  <Checkbox
                    label="Requerido para operar"
                    checked={row.required}
                    disabled={disabled}
                    onChange={(e) =>
                      update(row.id, { required: e.currentTarget.checked })
                    }
                  />
                  <Text size="xs" c="dimmed">
                    Predeterminado propone la selección; requerido expresa una
                    necesidad. No son lo mismo.
                  </Text>
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
                    Quitar de esta configuración
                  </Button>
                </Stack>
              </Card>
            ))}
        </Stack>
      ))}
      <Text size="sm" c="dimmed">
        Quitar una fila no elimina el elemento existente ni borra su historial o
        ubicación.
      </Text>
      <Modal
        opened={!!picker}
        onClose={() => setPicker(null)}
        title="Vincular sin duplicar inventario"
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
