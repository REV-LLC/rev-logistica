"use client";

import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  type CommercialGroup,
  type CommercialMode,
  type CommercialUnit,
  unitLabels,
} from "./types";

export default function CommercialModeCard({
  mode,
  groups,
  disabled,
  onChange,
  onRemove,
}: {
  mode: CommercialMode;
  groups: CommercialGroup[];
  disabled?: boolean;
  onChange: (mode: CommercialMode) => void;
  onRemove: () => void;
}) {
  const options = groups.map((group) => ({
    value: group.id,
    label: group.name || "Grupo sin nombre",
  }));
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Text fw={700}>{mode.name || "Nueva modalidad"}</Text>
          <Badge variant="light">{unitLabels[mode.unit]}</Badge>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Nombre de la modalidad"
            placeholder="Ej. Alquiler con implemento"
            required
            maxLength={120}
            value={mode.name}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...mode, name: event.currentTarget.value })
            }
          />
          <Select
            label="Unidad de cobro"
            required
            allowDeselect={false}
            value={mode.unit}
            disabled={disabled}
            data={Object.entries(unitLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(unit) => {
              if (unit)
                onChange({
                  ...mode,
                  unit: unit as CommercialUnit,
                  minimum: {
                    value: "0",
                    basis: unit === "HOUR" ? "PER_REPORTED_DAY" : "PER_RENTAL",
                  },
                  pricing: { source: "FIXED", amount: "" },
                });
            }}
            description="Cambiar de unidad limpia la tarifa y el mínimo: no se convierten automáticamente."
          />
          <Select
            label="De dónde sale la tarifa"
            value={mode.pricing.source}
            allowDeselect={false}
            disabled={disabled}
            data={[
              { value: "FIXED", label: "Tarifa de esta modalidad" },
              { value: "CATALOG", label: "Tarifa del catálogo (misma unidad)" },
            ]}
            onChange={(source) =>
              onChange({
                ...mode,
                pricing:
                  source === "CATALOG"
                    ? { source: "CATALOG" }
                    : { source: "FIXED", amount: "" },
              })
            }
          />
          {mode.pricing.source === "FIXED" ? (
            <NumberInput
              label={`Tarifa por ${mode.unit === "DAY" ? "día" : mode.unit === "HOUR" ? "hora" : "metro"}`}
              required
              min={0}
              max={9999999999.99}
              decimalScale={2}
              value={mode.pricing.amount}
              prefix="$ "
              thousandSeparator=","
              disabled={disabled}
              onChange={(amount) =>
                onChange({
                  ...mode,
                  pricing: { source: "FIXED", amount: String(amount) },
                })
              }
            />
          ) : (
            <Text size="sm" c="dimmed">
              El anexo comprobará que la tarifa del catálogo use{" "}
              {unitLabels[mode.unit].toLowerCase()}. Si falta o no coincide,
              pedirá revisión.
            </Text>
          )}
          <NumberInput
            label={`Mínimo de ${unitLabels[mode.unit].toLowerCase()}`}
            min={0}
            max={
              mode.unit === "HOUR" ? 24 : mode.unit === "DAY" ? 999 : 9999999999
            }
            allowDecimal={mode.unit !== "DAY"}
            decimalScale={6}
            value={mode.minimum.value}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...mode,
                minimum: { ...mode.minimum, value: String(value) },
              })
            }
            description={
              mode.unit === "HOUR"
                ? "Por día con trabajo reportado. No se toman horas de otro equipo."
                : "Por alquiler completo; no vuelve a empezar al cambiar de quincena."
            }
          />
        </SimpleGrid>
        <Stack gap="xs">
          <Text fw={600}>Cuándo aplica</Text>
          {!mode.conditions.length ? (
            <Text size="sm" c="dimmed">
              Siempre. Usa esta opción solo si hay una única modalidad.
            </Text>
          ) : null}
          {mode.conditions.map((condition, index) => (
            <SimpleGrid key={index} cols={{ base: 1, sm: 2 }} spacing="xs">
              <Select
                label="Grupo de implementos"
                data={options}
                value={condition.groupId || null}
                disabled={disabled}
                searchable
                onChange={(groupId) =>
                  onChange({
                    ...mode,
                    conditions: mode.conditions.map((row, i) =>
                      i === index ? { ...row, groupId: groupId ?? "" } : row,
                    ),
                  })
                }
              />
              <Select
                label="Condición"
                allowDeselect={false}
                disabled={disabled}
                value={condition.presence}
                data={[
                  { value: "PRESENT", label: "Va con el equipo" },
                  { value: "ABSENT", label: "No va con el equipo" },
                ]}
                onChange={(presence) =>
                  onChange({
                    ...mode,
                    conditions: mode.conditions.map((row, i) =>
                      i === index
                        ? { ...row, presence: presence as "PRESENT" | "ABSENT" }
                        : row,
                    ),
                  })
                }
              />
              {condition.presence === "PRESENT" ? (
                <NumberInput
                  label="Cantidad mínima del grupo"
                  min={1}
                  max={1000000}
                  allowDecimal={false}
                  value={condition.minimumQuantity ?? 1}
                  disabled={disabled}
                  onChange={(minimumQuantity) =>
                    onChange({
                      ...mode,
                      conditions: mode.conditions.map((row, i) =>
                        i === index
                          ? { ...row, minimumQuantity: Number(minimumQuantity) }
                          : row,
                      ),
                    })
                  }
                />
              ) : null}
              <Button
                type="button"
                variant="subtle"
                color="red"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...mode,
                    conditions: mode.conditions.filter((_, i) => i !== index),
                  })
                }
              >
                Quitar condición
              </Button>
            </SimpleGrid>
          ))}
          <Button
            type="button"
            variant="light"
            disabled={disabled || mode.conditions.length >= groups.length}
            onClick={() =>
              onChange({
                ...mode,
                conditions: [
                  ...mode.conditions,
                  {
                    groupId:
                      groups.find(
                        (group) =>
                          !mode.conditions.some(
                            (row) => row.groupId === group.id,
                          ),
                      )?.id ?? "",
                    presence: "PRESENT",
                    minimumQuantity: 1,
                  },
                ],
              })
            }
          >
            Agregar condición
          </Button>
          {mode.conditions.length > 1 ? (
            <Text size="xs" c="dimmed">
              Deben cumplirse todas las condiciones.
            </Text>
          ) : null}
        </Stack>
        {groups.length ? (
          <Stack gap="xs">
            <Text fw={600}>Cómo se cobran los elementos que acompañan</Text>
            {groups.map((group) => (
              <Select
                key={group.id}
                label={group.name || "Grupo sin nombre"}
                disabled={disabled}
                clearable
                placeholder="Sin definir: requiere revisión en el anexo"
                value={
                  mode.parts.find((part) => part.groupId === group.id)
                    ?.treatment ?? null
                }
                data={[
                  {
                    value: "INCLUDED",
                    label: "Incluidos en la tarifa del equipo",
                  },
                  {
                    value: "INDEPENDENT",
                    label: "Cobro independiente, con sus propias reglas",
                  },
                ]}
                onChange={(treatment) =>
                  onChange({
                    ...mode,
                    parts: [
                      ...mode.parts.filter((part) => part.groupId !== group.id),
                      ...(treatment
                        ? [
                            {
                              groupId: group.id,
                              treatment: treatment as
                                | "INCLUDED"
                                | "INDEPENDENT",
                            },
                          ]
                        : []),
                    ],
                  })
                }
              />
            ))}
            <Text size="xs" c="dimmed">
              «Incluido» no cambia el precio global del accesorio. Solo evita
              cobrarlo aparte dentro de este conjunto y modalidad.
            </Text>
          </Stack>
        ) : null}
        <Button
          type="button"
          variant="subtle"
          color="red"
          disabled={disabled}
          onClick={onRemove}
        >
          Quitar modalidad
        </Button>
      </Stack>
    </Card>
  );
}
