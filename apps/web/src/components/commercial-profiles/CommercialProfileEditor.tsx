"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import type { ConfigurationEntry } from "../equipment-configuration/types";
import CommercialModeCard from "./CommercialModeCard";
import {
  type CommercialProfile,
  configuredSelectorOptions,
  newCommercialMode,
  parseSelectorKey,
  selectorKey,
} from "./types";

export default function CommercialProfileEditor({
  value,
  entries,
  disabled,
  onChange,
}: {
  value: CommercialProfile;
  entries: ConfigurationEntry[];
  disabled?: boolean;
  onChange: (value: CommercialProfile) => void;
}) {
  const [alternateGroup, setAlternateGroup] = useState<string | null>(null);
  const options = configuredSelectorOptions(entries, value.groups);
  const groupOptions = value.groups.map((group) => ({
    value: group.id,
    label: group.name || "Grupo sin nombre",
  }));
  return (
    <Stack gap="lg">
      <Alert color="blue" title="Composición y cobro son decisiones distintas">
        Aquí defines cómo se cobra el conjunto. No cambias existencias, entregas
        ni las tarifas globales de sus piezas. Las condiciones se evalúan con lo
        que se entregó realmente, no solo con lo configurado en esta ficha.
      </Alert>
      <TextInput
        label="Vigente desde"
        type="date"
        required
        value={value.effectiveFrom ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, effectiveFrom: event.currentTarget.value })
        }
        description="Los anexos conservan la versión aplicada; esta edición no reemplaza sus condiciones históricas automáticamente."
      />
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Text fw={700}>1. Grupos de implementos</Text>
            <Text size="sm" c="dimmed">
              Agrupa los elementos que comparten una condición o forma de cobro.
            </Text>
          </div>
          <Button
            type="button"
            variant="light"
            disabled={disabled || value.groups.length >= 100 || !options.length}
            onClick={() =>
              onChange({
                ...value,
                groups: [
                  ...value.groups,
                  { id: crypto.randomUUID(), name: "", selectors: [] },
                ],
              })
            }
          >
            Agregar grupo
          </Button>
        </Group>
        {!options.length ? (
          <Text size="sm" c="dimmed">
            Puedes crear una modalidad simple sin implementos. Para condiciones
            con/sin elementos, guarda primero los componentes y accesorios del
            equipo.
          </Text>
        ) : null}
        {value.groups.map((group) => (
          <Card key={group.id} withBorder radius="md">
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label="Nombre del grupo"
                  placeholder="Ej. Implementos incluidos"
                  required
                  maxLength={120}
                  value={group.name}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      groups: value.groups.map((row) =>
                        row.id === group.id
                          ? { ...row, name: event.currentTarget.value }
                          : row,
                      ),
                    })
                  }
                />
                <MultiSelect
                  label="Elementos del grupo"
                  placeholder="Selecciona los elementos configurados"
                  data={options}
                  searchable
                  hidePickedOptions
                  value={group.selectors.map(selectorKey)}
                  disabled={disabled}
                  onChange={(selected) =>
                    onChange({
                      ...value,
                      groups: value.groups.map((row) =>
                        row.id === group.id
                          ? {
                              ...row,
                              selectors: selected.map(parseSelectorKey),
                            }
                          : row,
                      ),
                    })
                  }
                  description="Una familia abarca las unidades elegidas en la remisión. No selecciona una unidad fija."
                />
              </SimpleGrid>
              <Button
                type="button"
                color="red"
                variant="subtle"
                disabled={
                  disabled ||
                  value.modes.some(
                    (mode) =>
                      mode.conditions.some((row) => row.groupId === group.id) ||
                      mode.parts.some((row) => row.groupId === group.id),
                  )
                }
                onClick={() =>
                  onChange({
                    ...value,
                    groups: value.groups.filter((row) => row.id !== group.id),
                  })
                }
              >
                Quitar grupo
              </Button>
              {value.modes.some(
                (mode) =>
                  mode.conditions.some((row) => row.groupId === group.id) ||
                  mode.parts.some((row) => row.groupId === group.id),
              ) ? (
                <Text size="xs" c="dimmed">
                  Para quitarlo, desvincúlalo primero de las condiciones y
                  cobros de las modalidades.
                </Text>
              ) : null}
            </Stack>
          </Card>
        ))}
      </Stack>
      <Stack gap="sm">
        <Text fw={700}>2. Modalidades de cobro</Text>
        <Text size="sm" c="dimmed">
          Una modalidad por situación. Si coinciden varias, el anexo pedirá
          revisión; no sumará ambas.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} style={{ alignItems: "end" }}>
          <Button
            type="button"
            variant="light"
            disabled={disabled || value.modes.length >= 100}
            onClick={() =>
              onChange({
                ...value,
                modes: [...value.modes, newCommercialMode()],
              })
            }
          >
            Agregar modalidad
          </Button>
          {value.groups.length ? (
            <Select
              label="Alternativa según un grupo"
              placeholder="Escoge el implemento"
              data={groupOptions}
              value={alternateGroup}
              disabled={disabled}
              onChange={setAlternateGroup}
            />
          ) : null}
          {value.groups.length ? (
            <Button
              type="button"
              variant="default"
              disabled={
                disabled ||
                !alternateGroup ||
                !value.groups.some((group) => group.id === alternateGroup) ||
                value.modes.length > 98
              }
              onClick={() => {
                if (!alternateGroup) return;
                const without = newCommercialMode();
                const withPart = newCommercialMode();
                onChange({
                  ...value,
                  modes: [
                    ...value.modes,
                    {
                      ...without,
                      name: "Sin implemento",
                      conditions: [
                        { groupId: alternateGroup, presence: "ABSENT" },
                      ],
                    },
                    {
                      ...withPart,
                      name: "Con implemento",
                      conditions: [
                        {
                          groupId: alternateGroup,
                          presence: "PRESENT",
                          minimumQuantity: 1,
                        },
                      ],
                    },
                  ],
                });
              }}
            >
              Crear alternativas con / sin
            </Button>
          ) : null}
        </SimpleGrid>
        {value.modes.map((mode) => (
          <CommercialModeCard
            key={mode.id}
            mode={mode}
            groups={value.groups}
            disabled={disabled}
            onChange={(updated) =>
              onChange({
                ...value,
                modes: value.modes.map((row) =>
                  row.id === updated.id ? updated : row,
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...value,
                modes: value.modes.filter((row) => row.id !== mode.id),
              })
            }
          />
        ))}
        {!value.modes.length ? (
          <Text size="sm" c="dimmed">
            No hay modalidades propias. Agrega una para definir tarifa, unidad y
            mínimo sin depender del nombre del equipo.
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
