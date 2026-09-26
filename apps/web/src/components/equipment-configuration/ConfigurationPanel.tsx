"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Stack, Text } from "@mantine/core";
import { api } from "@/lib/api";
import ConfigurationEditor from "./ConfigurationEditor";
import {
  type EquipmentConfiguration,
  configurationError,
  configurationPayload,
} from "./types";

export default function ConfigurationPanel({
  assetId,
  accessoryId,
}: {
  assetId?: string;
  accessoryId?: string;
}) {
  const [value, setValue] = useState<EquipmentConfiguration>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const route = `/equipment-configurations/${assetId ? `assets/${assetId}` : `accessories/${accessoryId}`}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setValue(undefined);
    setSuccess("");
    api<EquipmentConfiguration>(route, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setValue(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [route, reload]);
  const save = async () => {
    if (!value || inFlight.current) return;
    const issue = configurationError(value);
    if (issue) {
      setError(issue);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api<EquipmentConfiguration>(route, {
        method: "PUT",
        json: configurationPayload(value),
      });
      setValue({ ...value, ...saved });
      setSuccess(
        "Configuración guardada. No se registraron entregas ni consumos.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <Stack>
      <Text fw={700} size="xl">
        Configurar componentes y accesorios
      </Text>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert color="green" role="status">
          {success}
        </Alert>
      ) : null}
      {loading ? (
        <Loader aria-label="Cargando configuración" />
      ) : value ? (
        <>
          <Text>{value.parent?.name}</Text>
          <ConfigurationEditor
            value={value}
            onChange={(v) => {
              setValue(v);
              setSuccess("");
            }}
            disabled={saving}
            canCreate={!!value.parent?.warehouseId}
            accessoryParent={!!accessoryId}
          />
          {!value.parent?.warehouseId ? (
            <Text size="sm">
              El elemento no está en una bodega. Puedes vincular elementos
              existentes; crea existencias nuevas desde Inventario.
            </Text>
          ) : null}
          <Group>
            <Button loading={saving} onClick={() => void save()}>
              Guardar configuración
            </Button>
            <Button
              variant="default"
              disabled={saving}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Descartar cambios sin guardar y recargar la configuración?",
                  )
                ) {
                  setSuccess("");
                  setReload((r) => r + 1);
                }
              }}
            >
              Recargar
            </Button>
          </Group>
        </>
      ) : (
        <Button onClick={() => setReload((r) => r + 1)}>Reintentar</Button>
      )}
    </Stack>
  );
}
