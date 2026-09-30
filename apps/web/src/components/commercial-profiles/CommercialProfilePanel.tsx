"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { api } from "@/lib/api";
import type { EquipmentConfiguration } from "../equipment-configuration/types";
import CommercialProfileEditor from "./CommercialProfileEditor";
import {
  type CommercialProfile,
  type CommercialScope,
  commercialError,
  commercialPayload,
  scopeLabels,
  todayInBogota,
  unitLabels,
} from "./types";

type AssetMetadata = {
  skuId?: string;
  sku?: { id: string; assetFamilyId?: string; assetFamily?: { id: string } };
};

export default function CommercialProfilePanel({
  assetId,
  onSaved,
  onDirtyChange,
}: {
  assetId: string;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [scopeType, setScopeType] = useState<CommercialScope>("ASSET");
  const [scopeIds, setScopeIds] = useState<
    Partial<Record<CommercialScope, string>>
  >({ ASSET: assetId });
  const [configuration, setConfiguration] = useState<EquipmentConfiguration>();
  const [value, setValue] = useState<CommercialProfile>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const scopeId = scopeType === "ASSET" ? assetId : scopeIds[scopeType];
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
    Promise.all([
      api<CommercialProfile>(
        `/commercial-profiles?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`,
        { signal: controller.signal },
      ),
      api<EquipmentConfiguration>(
        `/equipment-configurations/assets/${assetId}`,
        { signal: controller.signal },
      ),
      api<AssetMetadata>(`/assets/${assetId}`, { signal: controller.signal }),
    ])
      .then(([profile, config, asset]) => {
        if (controller.signal.aborted) return;
        setValue({
          ...profile,
          effectiveFrom: profile.effectiveFrom ?? todayInBogota(),
        });
        setConfiguration(config);
        setScopeIds({
          ASSET: assetId,
          SKU: asset.skuId ?? asset.sku?.id,
          FAMILY:
            config.parent?.familyId ??
            asset.sku?.assetFamilyId ??
            asset.sku?.assetFamily?.id,
        });
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
  }, [assetId, scopeType, scopeId, reload]);

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
        "Modalidades guardadas. No se modificaron existencias ni anexos históricos.",
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
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={700} size="xl">
            Modalidades de cobro
          </Text>
          <Text size="sm" c="dimmed">
            Condiciones compartidas con anexos, sin reglas por nombre de equipo.
          </Text>
        </div>
        {value ? (
          <Badge variant="light">
            {value.version ? `Versión ${value.version}` : "Sin perfil propio"}
          </Badge>
        ) : null}
      </Group>
      <Select
        label="Aplicar estas modalidades a"
        allowDeselect={false}
        value={scopeType}
        disabled={loading || saving}
        data={(Object.keys(scopeLabels) as CommercialScope[])
          .filter((scope) => scope === "ASSET" || scopeIds[scope])
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
      />
      {scopeType !== "ASSET" ? (
        <Alert color="orange">
          Estás configurando{" "}
          {scopeType === "FAMILY"
            ? "toda la familia"
            : "todos los equipos de esta referencia"}
          . Una regla propia de un equipo tiene prioridad. Usa grupos de
          familias si las unidades varían.
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
                  Versión {value.inherited.version}, vigente desde{" "}
                  {value.inherited.effectiveFrom}.{" "}
                  {value.inherited.modes
                    .map((mode) => `${mode.name} (${unitLabels[mode.unit]})`)
                    .join(" · ")}
                </Text>
                <Text size="sm">
                  Guardar aquí crea una configuración propia y reemplaza
                  completa la heredada, no la suma.
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
                      effectiveFrom: todayInBogota(),
                    });
                  }}
                >
                  Usar heredadas como punto de partida
                </Button>
              </Stack>
            </Alert>
          ) : !value.version ? (
            <Text size="sm" c="dimmed">
              No hay un perfil propio guardado. Sin condiciones suficientes, el
              anexo pedirá revisión; no asumirá que el alquiler es gratuito.
            </Text>
          ) : null}
          <CommercialProfileEditor
            value={value}
            entries={configuration?.entries ?? []}
            disabled={saving}
            onChange={change}
          />
          <Group grow align="stretch">
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
          </Group>
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
