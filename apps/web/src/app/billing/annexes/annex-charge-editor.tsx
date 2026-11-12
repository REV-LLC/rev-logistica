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
  Textarea,
  TextInput,
} from "@mantine/core";
import { api } from "@/lib/api";
import type { AdditionalCharge } from "./types";
import glassStyles from "./annex-glass.module.css";
import { getCurrentUserSession } from '@/lib/auth';
import { lossDate, type WorksiteLoss } from '@/components/WorksiteLossModal';
type WorksiteTag = {
  id: string;
  skuId: string;
  assetId?: string;
  label: string;
  price: string | number | null;
  replacementValue: string | number | null;
  owners?: Array<{ id: string; name: string }>;
};
const money = (value: string) =>
  Number(value).toLocaleString("es-CO", { style: "currency", currency: "COP" });
export default function AnnexChargeEditor({
  initial,
  customerWorksiteId,
  disabled,
  removable,
  onApply,
  onRemove,
  onClose,
}: {
  initial: AdditionalCharge;
  customerWorksiteId: string;
  disabled: boolean;
  removable: boolean;
  onApply: (charge: AdditionalCharge) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [charge, setCharge] = useState(initial);
  const [skus, setSkus] = useState<WorksiteTag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [losses, setLosses] = useState<WorksiteLoss[]>([]);
  const [lossesError, setLossesError] = useState<string | null>(null);
  const [lossesLoading, setLossesLoading] = useState(true);
  const [lossesRetry, setLossesRetry] = useState(0);
  const session = getCurrentUserSession();
  const defaultResponsible = session?.name || [session?.firstName, session?.lastName].filter(Boolean).join(' ') || session?.email || '';
  const immutableLoss = Boolean(initial.inventoryLoss?.lossId);
  const replacement = charge.type === "REPLACEMENT";
  useEffect(() => {
    const request = new AbortController();
    setLossesLoading(true); setLossesError(null);
    api<WorksiteLoss[]>(`/inventory/worksite-losses/${customerWorksiteId}`, { signal: request.signal })
      .then(setLosses).catch(cause => { if (!request.signal.aborted) setLossesError(cause instanceof Error ? cause.message : 'No se pudo consultar el historial de pérdidas'); })
      .finally(() => { if (!request.signal.aborted) setLossesLoading(false); });
    return () => request.abort();
  }, [customerWorksiteId, lossesRetry]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoaded(false);
    setSkus([]);
    setError(null);
    api<WorksiteTag[]>(
      `/annexes/charge-options?customerWorksiteId=${encodeURIComponent(customerWorksiteId)}`,
      { signal: controller.signal },
    )
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
              : "No se pudieron consultar los tags de la obra.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [customerWorksiteId]);
  const selected = skus.find((row) =>
    charge.assetId
      ? row.assetId === charge.assetId
      : !row.assetId && row.skuId === charge.skuId,
  );
  const missingPrice =
    !selected?.replacementValue || Number(selected.replacementValue) === 0;
  function selectTag(value: string | null) {
    const tag = skus.find((row) => row.id === value);
    setCharge({
      ...charge,
      skuId: tag?.skuId,
      assetId: tag?.assetId,
      description: tag?.label.slice(0, 300) ?? "",
      quantity: tag?.assetId ? "1" : charge.quantity,
      unitPrice:
        replacement && tag?.replacementValue != null
          ? Number(tag.replacementValue).toFixed(2)
          : "0.00",
      inventoryLoss: replacement && tag ? {
        date: lossDate(new Date().toISOString()), ownerWarehouseId: tag.owners?.length === 1 ? tag.owners[0].id : '',
        reason: '', responsible: defaultResponsible,
      } : undefined,
    });
  }
  const locked = disabled || saving || loading;
  const valid =
    loaded &&
    !!selected &&
    charge.description.trim() &&
    Number(charge.quantity) > 0 &&
    Number(charge.unitPrice) > 0 && (!replacement || (!lossesLoading && !lossesError && charge.inventoryLoss?.ownerWarehouseId && charge.inventoryLoss.date && charge.inventoryLoss.reason.trim().length >= 5 && charge.inventoryLoss.responsible.trim().length >= 2));
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
      await api(`/skus/${selected.skuId}/pricing`, {
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
        title="Reposición o reparación"
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
            readOnly={immutableLoss}
            onChange={(value) => {
              setError(null);
              const type = value as AdditionalCharge["type"];
              setCharge({
                ...charge,
                type,
                inventoryLoss: type === 'REPLACEMENT' ? charge.inventoryLoss ?? { date: lossDate(new Date().toISOString()), ownerWarehouseId: selected?.owners?.length === 1 ? selected.owners[0].id : '', reason: '', responsible: defaultResponsible } : undefined,
                unitPrice:
                  type === "REPLACEMENT" && selected?.replacementValue != null
                    ? Number(selected.replacementValue).toFixed(2)
                    : "0.00",
              });
            }}
          />
          <Select
            label="Tag de la obra"
            placeholder={
              loading
                ? "Consultando tags…"
                : "Escribe el tag o nombre del equipo"
            }
            searchable
            clearable
            nothingFoundMessage="No se encontraron tags en esta obra"
            data={skus.map((row) => ({ value: row.id, label: row.label }))}
            value={selected?.id ?? null}
            disabled={locked || immutableLoss}
            onChange={selectTag}
          />
          {loaded && skus.length === 0 && (
            <Text size="sm" c="dimmed">
              Esta obra no tiene equipos entregados registrados.
            </Text>
          )}
          {selected && replacement && (
            <Text size="sm" c="dimmed">
              {missingPrice
                ? "Este tag no tiene precio de reposición. Ingresa el valor por unidad."
                : `Precio de reposición: ${money(String(selected.replacementValue))}`}
            </Text>
          )}
          <NumberInput
            label="Cantidad"
            value={Number(charge.quantity)}
            min={1}
            max={9999}
            allowDecimal={false}
            allowNegative={false}
            disabled={locked || immutableLoss || Boolean(charge.inventoryLoss?.lossId) || !!selected?.assetId}
            onChange={(value) =>
              setCharge({
                ...charge,
                quantity: String(Math.trunc(Number(value) || 0)),
              })
            }
          />
          {replacement && selected ? <>
            {lossesError ? <Alert color="red">{lossesError}<Button variant="subtle" size="compact-sm" onClick={() => setLossesRetry(value => value + 1)}>Reintentar</Button></Alert> : null}
            <Select label="Baja de inventario" value={charge.inventoryLoss?.lossId ?? 'NEW'} disabled={locked || immutableLoss}
              data={[{ value: 'NEW', label: 'Registrar nueva pérdida al guardar' }, ...losses.filter(loss => loss.skuId === charge.skuId && loss.assetId === (charge.assetId ?? null)
                && (!loss.annexChargeKey || loss.id === charge.inventoryLoss?.lossId)).map(loss => ({ value: loss.id, label: `${lossDate(loss.effectiveAt)} · ${loss.quantity} unidades · ${loss.responsible}` }))]}
              onChange={value => {
                const loss = losses.find(item => item.id === value);
                setCharge({ ...charge, ...(loss ? { quantity: String(loss.quantity) } : {}), inventoryLoss: loss ? {
                  lossId: loss.id, date: lossDate(loss.effectiveAt), ownerWarehouseId: loss.ownerWarehouseId, reason: loss.reason, responsible: loss.responsible,
                } : { date: lossDate(new Date().toISOString()), ownerWarehouseId: selected.owners?.length === 1 ? selected.owners[0].id : '', reason: '', responsible: defaultResponsible } });
              }} />
            <Select label="Dueño del inventario" required value={charge.inventoryLoss?.ownerWarehouseId ?? null} disabled={locked || Boolean(charge.inventoryLoss?.lossId)}
              data={selected.owners?.map(owner => ({ value: owner.id, label: owner.name })) ?? []}
              onChange={value => setCharge({ ...charge, inventoryLoss: { date: lossDate(new Date().toISOString()), reason: '', responsible: defaultResponsible, ...charge.inventoryLoss, ownerWarehouseId: value ?? '' } })} />
            <TextInput label="Fecha de pérdida" type="date" required value={charge.inventoryLoss?.date ?? ''} max={lossDate(new Date().toISOString())}
              disabled={locked || Boolean(charge.inventoryLoss?.lossId)} onChange={event => setCharge({ ...charge, inventoryLoss: { ownerWarehouseId: '', reason: '', responsible: defaultResponsible, ...charge.inventoryLoss, date: event.currentTarget.value } })} />
            <Textarea label="Motivo de la pérdida" required maxLength={500} value={charge.inventoryLoss?.reason ?? ''} disabled={locked || Boolean(charge.inventoryLoss?.lossId)}
              onChange={event => setCharge({ ...charge, inventoryLoss: { ownerWarehouseId: '', date: '', responsible: defaultResponsible, ...charge.inventoryLoss, reason: event.currentTarget.value } })} />
            <TextInput label="Responsable del reporte" required maxLength={160} value={charge.inventoryLoss?.responsible ?? defaultResponsible} disabled={locked || Boolean(charge.inventoryLoss?.lossId)}
              onChange={event => setCharge({ ...charge, inventoryLoss: { ownerWarehouseId: '', date: '', reason: '', ...charge.inventoryLoss, responsible: event.currentTarget.value } })} />
            <Alert color="orange">Al guardar el anexo, esta reposición registrará la pérdida y cerrará el alquiler de las unidades desde esa fecha. Una baja ya registrada no se descontará de nuevo.</Alert>
          </> : null}
          {selected && (!replacement || missingPrice) && (
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
          )}
          <Text>
            Total:{" "}
            {money(
              (Number(charge.quantity) * Number(charge.unitPrice)).toFixed(2),
            )}
          </Text>
          <Group justify="space-between">
            {removable && !immutableLoss && (
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
              Agregar al anexo
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
            ¿Quieres actualizar el precio de reposición de {selected?.label} en
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
