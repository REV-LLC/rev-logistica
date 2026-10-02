"use client";
import { useState } from "react";
import {
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  type ConfigurationEntry,
  configurationError,
  configurationPartAction,
  entryName,
  partRoleLabels,
} from "./types";
type Props = {
  entry: ConfigurationEntry;
  creating: boolean;
  disabled?: boolean;
  accessoryParent: boolean;
  onCancel: () => void;
  onApply: (entry: ConfigurationEntry) => void;
  onRemove: () => void;
  onConfigurePart?: () => void;
};
export default function ConfigurationEntryOptions({
  entry,
  creating,
  disabled,
  accessoryParent,
  onCancel,
  onApply,
  onRemove,
  onConfigurePart,
}: Props) {
  const [draft, setDraft] = useState(entry);
  const [error, setError] = useState("");
  const individual =
    !!draft.assetId ||
    draft.newPart?.kind === "INDIVIDUAL" ||
    draft.accessory?.kind === "INDIVIDUAL";
  const singleFamily =
    !!draft.familyId &&
    draft.family?.controlType === "SERIAL" &&
    draft.maximumQuantity === 1;
  const patch = (changes: Partial<ConfigurationEntry>) => {
    setDraft((previous) => ({ ...previous, ...changes }));
    setError("");
  };
  const patchNew = (
    changes: Partial<NonNullable<ConfigurationEntry["newPart"]>>,
  ) => patch({ newPart: { ...draft.newPart!, ...changes } });
  const action = configurationPartAction(draft);
  return (
    <Modal
      opened
      onClose={onCancel}
      title={
        draft.newPart
          ? `Nuevo ${partRoleLabels[draft.role].toLowerCase()}`
          : entryName(entry)
      }
      centered
      size="md"
      closeOnClickOutside={!disabled}
      withCloseButton={!disabled}
      closeOnEscape={!disabled}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">{partRoleLabels[draft.role]}</Text>
        {draft.newPart ? (
          <>
            <TextInput
              label="Nombre"
              required
              maxLength={160}
              value={draft.newPart.name}
              disabled={disabled}
              onChange={(event) =>
                patchNew({ name: event.currentTarget.value })
              }
            />
            {draft.role === "ACCESSORY" ? (
              <Select
                label="Cómo se controla"
                value={draft.newPart.kind}
                allowDeselect={false}
                disabled={disabled}
                data={[
                  { value: "INDIVIDUAL", label: "Una pieza identificada" },
                  { value: "RETURNABLE", label: "Por cantidad, se devuelve" },
                  { value: "CONSUMABLE", label: "Por cantidad, se consume" },
                ]}
                onChange={(kind) =>
                  patch({
                    quantity: 1,
                    maximumQuantity: null,
                    newPart: {
                      ...draft.newPart!,
                      kind: kind as NonNullable<
                        ConfigurationEntry["newPart"]
                      >["kind"],
                      initialQuantity: 1,
                    },
                  })
                }
              />
            ) : null}
            {individual ? (
              <Text size="sm" c="dimmed">
                Se creará una pieza en bodega.
              </Text>
            ) : (
              <NumberInput
                label="Cantidad inicial en bodega"
                min={1}
                max={1000000}
                allowDecimal={false}
                value={draft.newPart.initialQuantity}
                disabled={disabled}
                onChange={(value) =>
                  patchNew({ initialQuantity: Number(value) })
                }
              />
            )}
            {draft.role === "COMPONENT" && !accessoryParent ? (
              <Checkbox
                label="Pertenece únicamente a este equipo"
                checked={draft.newPart.exclusive}
                disabled={disabled}
                onChange={(event) =>
                  patchNew({
                    exclusive: event.currentTarget.checked,
                    compatibility: "PARENT",
                  })
                }
              />
            ) : null}
            {!accessoryParent ? (
              <Select
                label="Puede usarse con"
                value={draft.newPart.compatibility ?? "PARENT"}
                allowDeselect={false}
                disabled={disabled || draft.newPart.exclusive}
                data={[
                  { value: "PARENT", label: "Este equipo" },
                  { value: "SUBFAMILY", label: "Equipos de esta subfamilia" },
                  { value: "FAMILY", label: "Equipos de esta familia" },
                ]}
                onChange={(value) =>
                  patchNew({
                    compatibility: value as "PARENT" | "SUBFAMILY" | "FAMILY",
                  })
                }
              />
            ) : null}
          </>
        ) : null}
        {draft.familyId ? (
          <Text size="sm" c="dimmed">
            Esta opción permite usar equipos de esa familia. La pieza concreta
            se selecciona al preparar la entrega.
          </Text>
        ) : (
          <Checkbox
            label="Agregar automáticamente a la entrega"
            checked={draft.defaultIncluded}
            disabled={disabled}
            onChange={(event) =>
              patch({ defaultIncluded: event.currentTarget.checked })
            }
          />
        )}
        <Checkbox
          label="No permitir una entrega sin este elemento"
          checked={draft.required}
          disabled={disabled}
          onChange={(event) => patch({ required: event.currentTarget.checked })}
        />
        {!individual && !singleFamily ? (
          <>
            <NumberInput
              label="Cantidad por entrega"
              min={1}
              max={1000000}
              allowDecimal={false}
              disabled={disabled}
              value={draft.quantity}
              onChange={(value) => patch({ quantity: Number(value) })}
            />
            <details>
              <summary style={{ cursor: "pointer", fontSize: 14 }}>
                Límite de cantidad
              </summary>
              <NumberInput
                label="Máximo por entrega"
                placeholder="Sin límite"
                mt="sm"
                min={draft.quantity}
                max={1000000}
                allowDecimal={false}
                disabled={disabled}
                value={draft.maximumQuantity ?? ""}
                onChange={(value) =>
                  patch({
                    maximumQuantity: typeof value === "number" ? value : null,
                  })
                }
              />
            </details>
          </>
        ) : null}
        {error ? (
          <Text role="alert" c="red" size="sm">
            {error}
          </Text>
        ) : null}
        {!creating ? (
          <>
            <Divider />
            {action && onConfigurePart ? (
              <Button
                variant="light"
                disabled={disabled}
                onClick={() => {
                  if (
                    JSON.stringify(draft) !== JSON.stringify(entry) &&
                    !window.confirm(
                      "Hay opciones sin aplicar. ¿Descartarlas y abrir la configuración del elemento?",
                    )
                  )
                    return;
                  onConfigurePart();
                }}
              >
                {action}
              </Button>
            ) : null}
            <Button
              variant="subtle"
              color="red"
              disabled={disabled}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Desvincular este elemento? No se elimina del inventario ni se modifica su historial.",
                  )
                )
                  onRemove();
              }}
            >
              Desvincular del equipo
            </Button>
          </>
        ) : null}
        <Group justify="center" gap="sm" wrap="wrap" mt="sm">
          <Button variant="default" disabled={disabled} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              const issue = configurationError({
                version: 0,
                entries: [draft],
              });
              if (issue) {
                setError(issue);
                return;
              }
              if (
                draft.maximumQuantity != null &&
                draft.maximumQuantity < draft.quantity
              ) {
                setError(
                  "El máximo no puede ser menor que la cantidad por entrega.",
                );
                return;
              }
              onApply(draft);
            }}
          >
            {creating ? "Agregar al conjunto" : "Aplicar"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
