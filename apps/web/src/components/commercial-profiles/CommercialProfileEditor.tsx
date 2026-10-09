"use client";

import {
  Button,
  Card,
  Group,
  MultiSelect,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import type { ConfigurationEntry } from "../equipment-configuration/types";
import CommercialModeCard from "./CommercialModeCard";
import {
  type CommercialProfile,
  type CommercialMode,
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
  const options = configuredSelectorOptions(entries, value.groups);
  const renderMode = (mode: CommercialMode) => <CommercialModeCard
    key={mode.id} mode={mode} groups={value.groups} disabled={disabled}
    onChange={updated => onChange({ ...value, modes: value.modes.map(row => row.id === updated.id ? updated : row) })}
    onRemove={() => onChange({ ...value, modes: value.modes.filter(row => row.id !== mode.id) })}
  />;
  // A rate appears once: next to its sole group, or under multi-group combinations.
  const groupedModes = value.modes.filter(mode => mode.conditions.length === 1
    && value.groups.some(group => group.id === mode.conditions[0].groupId));
  return (
    <Stack gap="lg">
      {options.length || value.groups.length ? <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Text fw={700}>Grupos de implementos</Text>
            <Text size="sm" c="dimmed">
              Agrupa implementos y configura sus combinaciones de cobro.
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
            Para cobrar con/sin implementos, guarda primero las piezas del conjunto.
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
                />
              </SimpleGrid>
              {groupedModes.filter(mode => mode.conditions[0].groupId === group.id).map(renderMode)}
              <Button type="button" variant="light" disabled={disabled || value.modes.length > 98
                || groupedModes.some(mode => mode.conditions[0].groupId === group.id)}
                onClick={() => {
                  const without = newCommercialMode();
                  const withPart = newCommercialMode();
                  onChange({ ...value, modes: [...value.modes,
                    { ...without, name: `Sin ${group.name || 'implemento'}`, conditions: [{ groupId: group.id, presence: 'ABSENT' }],
                      parts: [{ groupId: group.id, treatment: 'INCLUDED' }] },
                    { ...withPart, name: `Con ${group.name || 'implemento'}`, conditions: [{ groupId: group.id, presence: 'PRESENT', minimumQuantity: 1 }],
                      parts: [{ groupId: group.id, treatment: 'INCLUDED' }] },
                  ] });
                }}>Crear alternativas con / sin</Button>
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
                  Este grupo está en uso en una modalidad.
                </Text>
              ) : null}
            </Stack>
          </Card>
        ))}
      </Stack> : null}
      <Stack gap="sm">
        <Text fw={700}>Otras combinaciones</Text>
        <Text size="sm" c="dimmed">
          Precio c/u × cantidad calculada en el anexo.
        </Text>
        <Group>
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
            Agregar combinación
          </Button>
        </Group>
        {value.modes.filter(mode => !groupedModes.includes(mode)).map(renderMode)}
        {!value.modes.length ? (
          <Text size="sm" c="dimmed">
            Agrega una combinación para definir precio y mínimo.
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
