"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "@/lib/api";
import type { AdditionalCharge } from "./types";
import glassStyles from "./annex-glass.module.css";
type Sku = {
  id: string;
  name: string;
  price: string | number | null;
  replacementValue: string | number | null;
};
const money = (value: string) =>
  Number(value).toLocaleString("es-CO", { style: "currency", currency: "COP" });
export default function AnnexChargeEditor({
  initial,
  disabled,
  removable,
  onApply,
  onRemove,
  onClose,
}: {
  initial: AdditionalCharge;
  disabled: boolean;
  removable: boolean;
  onApply: (charge: AdditionalCharge) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [charge, setCharge] = useState(initial);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replacement = charge.type === "REPLACEMENT";
  useEffect(() => {
    if (!replacement) return;
    let active = true;
    setLoading(true);
    api<Sku[]>("/skus")
      .then((rows) => {
        if (active) {
          setSkus(rows);
          setLoaded(true);
          setError(null);
        }
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo consultar el catálogo.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [replacement]);
  const selected = skus.find((row) => row.id === charge.skuId);
  const locked = disabled || saving;
  const valid =
    charge.description.trim() &&
    Number(charge.quantity) > 0 &&
    (!replacement || (loaded && !!selected && Number(charge.unitPrice) > 0));
  const normalized = () => ({
    ...charge,
    description: charge.description.trim(),
  });
  function apply() {
    if (!valid || locked) return;
    setError(null);
    if (
      replacement &&
      selected &&
      (selected.replacementValue === null ||
        Number(selected.replacementValue) === 0)
    )
      setConfirm(true);
    else onApply(normalized());
  }
  async function updateCatalog() {
    if (!selected || locked) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/skus/${selected.id}/pricing`, {
        method: "PATCH",
        json: {
          price: selected.price === null ? null : String(selected.price),
          replacementValue: charge.unitPrice,
          expected: {
            price: selected.price === null ? null : String(selected.price),
            replacementValue:
              selected.replacementValue === null
                ? null
                : String(selected.replacementValue),
          },
          reason: "Valor de reposición asignado desde un anexo",
        },
      });
      onApply(normalized());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el precio de reposición.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Modal
        opened
        onClose={() => {
          if (!saving) onClose();
        }}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
        title="Reparación o reposición"
        classNames={{ content: glassStyles.theme }}
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <Select
            label="Tipo de cobro"
            data={[
              { value: "REPAIR", label: "Reparación" },
              { value: "REPLACEMENT", label: "Reposición" },
            ]}
            value={charge.type}
            allowDeselect={false}
            disabled={locked}
            onChange={(value) => {
              setError(null);
              setCharge({ ...charge, type: value as AdditionalCharge["type"] });
            }}
          />
          {replacement && (
            <Select
              label="Equipo o referencia"
              placeholder={
                loading ? "Consultando catálogo…" : "Selecciona el equipo"
              }
              searchable
              data={skus.map((row) => ({ value: row.id, label: row.name }))}
              value={charge.skuId ?? null}
              disabled={locked || loading}
              onChange={(value) => {
                const sku = skus.find((row) => row.id === value);
                setCharge({
                  ...charge,
                  skuId: value ?? undefined,
                  description: sku?.name.slice(0, 300) ?? charge.description,
                  unitPrice:
                    sku?.replacementValue == null
                      ? "0.00"
                      : Number(sku.replacementValue).toFixed(2),
                });
              }}
            />
          )}
          {replacement && selected && (
            <Text size="sm" c="dimmed">
              {selected.replacementValue == null ||
              Number(selected.replacementValue) === 0
                ? "Este equipo no tiene precio de reposición. Ingresa el valor para este cobro."
                : `Precio de reposición del catálogo: ${money(String(selected.replacementValue))}`}
            </Text>
          )}
          <TextInput
            label="Descripción"
            value={charge.description}
            maxLength={300}
            disabled={locked}
            onChange={(event) =>
              setCharge({ ...charge, description: event.currentTarget.value })
            }
          />
          <NumberInput
            label="Cantidad"
            value={Number(charge.quantity)}
            min={1}
            max={9999}
            allowDecimal={false}
            allowNegative={false}
            disabled={locked}
            onChange={(value) =>
              setCharge({
                ...charge,
                quantity: String(Math.trunc(Number(value) || 0)),
              })
            }
          />
          <NumberInput
            label="Precio unitario"
            prefix="$ "
            thousandSeparator="."
            decimalSeparator=","
            decimalScale={2}
            fixedDecimalScale
            value={Number(charge.unitPrice)}
            min={0}
            max={9999999999.99}
            allowNegative={false}
            disabled={locked}
            onChange={(value) =>
              setCharge({
                ...charge,
                unitPrice: (Number(value) || 0).toFixed(2),
              })
            }
          />
          <Text>
            Total:{" "}
            {money(
              (Number(charge.quantity) * Number(charge.unitPrice)).toFixed(2),
            )}
          </Text>
          <Group justify="space-between">
            {removable && (
              <Button
                color="red"
                variant="subtle"
                disabled={locked}
                onClick={onRemove}
              >
                Quitar fila
              </Button>
            )}
            <Button disabled={locked || !valid} onClick={apply}>
              Aplicar al anexo
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={confirm}
        onClose={() => {
          if (!saving) setConfirm(false);
        }}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
        title="Guardar precio de reposición"
        classNames={{ content: glassStyles.theme }}
      >
        <Stack>
          <Text>
            ¿Quieres actualizar el precio de reposición de {selected?.name} en
            el catálogo con {money(charge.unitPrice)} por unidad?
          </Text>
          <Text size="sm" c="dimmed">
            El cambio se guarda en el catálogo al confirmar y queda registrado
            en el historial de precios.
          </Text>
          {error && <Alert color="red">{error}</Alert>}
          <Button loading={saving} disabled={locked} onClick={updateCatalog}>
            Sí, actualizar y aplicar
          </Button>
          <Button
            variant="light"
            disabled={locked}
            onClick={() => onApply(normalized())}
          >
            No, usar solo en este anexo
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
