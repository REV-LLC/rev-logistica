"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { api } from "@/lib/api";
import type { EquipmentConfiguration } from "../equipment-configuration/types";
import type { Accessory } from "../accessories/types";
import CommercialProfileEditor from "./CommercialProfileEditor";
import {
  type CommercialProfile,
  type CommercialScope,
  commercialError,
  commercialPayload,
  commercialScopeIds,
  scopeLabels,
} from "./types";

type AssetMetadata = {
  isImplement?: boolean;
  skuId?: string;
  sku?: { id: string; assetFamilyId?: string; assetFamily?: { id: string } };
};

export default function CommercialProfilePanel({
  assetId,
  accessoryId,
  skuId,
  onSaved,
  onDirtyChange,
  onBusyChange,
}: {
  assetId?: string;
  accessoryId?: string;
  skuId?: string;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const ownScope = skuId ? 'SKU' : accessoryId ? "ACCESSORY" : "ASSET";
  const [scopeType, setScopeType] = useState<CommercialScope>(ownScope);
  const [scopeIds, setScopeIds] = useState<
    Partial<Record<CommercialScope, string>>
  >({ [ownScope]: skuId ?? accessoryId ?? assetId });
  const [configuration, setConfiguration] = useState<EquipmentConfiguration>();
  const [value, setValue] = useState<CommercialProfile>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const scopeId = scopeType === ownScope ? skuId ?? accessoryId ?? assetId : scopeIds[scopeType];
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setValue(undefined);
    setSuccess("");
    setDirty(false);
    if (!scopeId) {
      setError("No se pudo identificar el alcance de esta configuración.");
      setLoading(false);
      return;
    }
    const accessory = accessoryId
      ? api<Accessory>(`/accessories/${accessoryId}`, { signal: controller.signal })
      : null;
    const physical = skuId ? api<{ name: string; assetFamilyId: string; isImplement: boolean }>(`/skus/${skuId}`, { signal: controller.signal })
      .then(item => ({ version: 0, entries: [], parent: { name: item.name, familyId: item.assetFamilyId, warehouseId: null, isImplement: item.isImplement } })) : accessory
      ? accessory.then(item => item.kind === "INDIVIDUAL" && item.purpose !== "COMPONENT"
        ? api<EquipmentConfiguration>(`/equipment-configurations/accessories/${accessoryId}`, { signal: controller.signal })
        : { version: 0, entries: [], parent: { name: item.name, familyId: item.familyId, warehouseId: null } })
      : api<EquipmentConfiguration>(`/equipment-configurations/assets/${assetId}`, { signal: controller.signal });
    Promise.all([
      api<CommercialProfile>(
        `/commercial-profiles?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`,
        { signal: controller.signal },
      ),
      physical,
      accessory || skuId ? Promise.resolve(null) : api<AssetMetadata>(`/assets/${assetId}`, { signal: controller.signal }),
    ])
      .then(([profile, config, asset]) => {
        if (controller.signal.aborted) return;
        setValue(profile);
        setConfiguration(config);
        const nextIds = commercialScopeIds(skuId ? { SKU: skuId, FAMILY: config.parent?.familyId } : accessoryId ? { ACCESSORY: accessoryId } : {
          ASSET: assetId,
          SKU: asset?.skuId ?? asset?.sku?.id,
          FAMILY:
            config.parent?.familyId ??
            asset?.sku?.assetFamilyId ??
            asset?.sku?.assetFamily?.id,
        }, config.parent?.isImplement === true || asset?.isImplement === true);
        setScopeIds(nextIds);
        if (scopeType !== ownScope && !nextIds[scopeType]) setScopeType(ownScope);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las modalidades.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [assetId, accessoryId, skuId, scopeType, scopeId, reload]);

  const change = (next: CommercialProfile) => {
    setValue(next);
    setDirty(true);
    setSuccess("");
  };
  const save = async () => {
    if (!value || inFlight.current) return;
    const issue = commercialError(value);
    if (issue) {
      setError(issue);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    onBusyChange?.(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api<CommercialProfile>("/commercial-profiles", {
        method: "PUT",
        json: commercialPayload(value),
      });
      setValue(saved);
      setDirty(false);
      setSuccess(
        "Modalidades guardadas.",
      );
      onSaved?.();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar. El equipo ya existe; no lo crees otra vez.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={700} size="xl">
            Modalidades de cobro
          </Text>
        </div>
        {value ? (
          <Badge variant="light">
            {value.version ? "Configurado" : value.inherited ? "Heredado" : "Pendiente"}
          </Badge>
        ) : null}
      </Group>
      {!accessoryId ? <Select
        label="Aplicar estas modalidades a"
        allowDeselect={false}
        value={scopeType}
        disabled={loading || saving}
        data={(Object.keys(scopeLabels) as CommercialScope[])
          .filter((scope) => scope === ownScope || scopeIds[scope])
          .map((scope) => ({ value: scope, label: scopeLabels[scope] }))}
        onChange={(scope) => {
          if (
            !scope ||
            scope === scopeType ||
            (dirty &&
              !window.confirm(
                "Hay cambios comerciales sin guardar. ¿Descartarlos y cambiar el alcance?",
              ))
          )
            return;
          setScopeType(scope as CommercialScope);
        }}
      /> : null}
      {scopeType !== "ASSET" && scopeType !== "ACCESSORY" ? (
        <Alert color="orange">
          Estás configurando{" "}
          {scopeType === "FAMILY"
            ? "toda la familia"
            : "todos los equipos de esta referencia"}
          {scopeType === "FAMILY"
            ? ". Afecta a los equipos sin configuración propia, no a los implementos."
            : ". Afecta a todos sus equipos sin configuración propia."}
        </Alert>
      ) : null}
      {error ? (
        <Alert color="red" role="alert" title="No se completó la operación">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert color="green" role="status">
          {success}
        </Alert>
      ) : null}
      {loading ? (
        <Loader aria-label="Cargando modalidades comerciales" />
      ) : value ? (
        <>
          {!value.version && value.inherited ? (
            <Alert
              color="cyan"
              title={`Hereda de ${scopeLabels[value.inherited.scopeType].toLowerCase()}`}
            >
              <Stack gap="xs">
                <Text size="sm">
                  Guardar aquí reemplaza las modalidades heredadas para este elemento.
                </Text>
                <Button
                  type="button"
                  variant="light"
                  disabled={saving || dirty}
                  onClick={() => {
                    if (!value.inherited) return;
                    change({
                      ...value,
                      groups: structuredClone(value.inherited.groups),
                      modes: structuredClone(value.inherited.modes),
                    });
                  }}
                >
                  Copiar heredadas
                </Button>
              </Stack>
            </Alert>
          ) : !value.version ? (
            <Text size="sm" c="dimmed">
              Sin tarifa configurada: requiere revisión en el anexo.
            </Text>
          ) : null}
          <CommercialProfileEditor
            value={value}
            entries={configuration?.entries ?? []}
            disabled={saving}
            onChange={change}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Button
              type="button"
              loading={saving}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Guardar modalidades
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={saving}
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "¿Descartar los cambios comerciales sin guardar?",
                  )
                )
                  return;
                setReload((value) => value + 1);
              }}
            >
              Recargar modalidades
            </Button>
          </SimpleGrid>
          {dirty ? (
            <Text size="sm" c="orange" role="status">
              Hay cambios comerciales sin guardar.
            </Text>
          ) : null}
        </>
      ) : (
        <Button type="button" onClick={() => setReload((value) => value + 1)}>
          Reintentar carga
        </Button>
      )}
    </Stack>
  );
}
