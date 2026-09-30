"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Stack, Tabs, Text } from "@mantine/core";
import { api } from "@/lib/api";
import CommercialProfilePanel from "../commercial-profiles/CommercialProfilePanel";
import type { Accessory } from "../accessories/types";
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
  return accessoryId ? <AccessoryConfigurationPanel key={accessoryId} accessoryId={accessoryId} />
    : <ConfigurationTabs key={assetId} assetId={assetId} />;
}

function AccessoryConfigurationPanel({ accessoryId }: { accessoryId: string }) {
  const [item, setItem] = useState<Accessory>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Accessory>(`/accessories/${accessoryId}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setItem(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [accessoryId, revision]);
  if (error) return <Alert color="red">{error}<Button onClick={() => setRevision(value => value + 1)}>Reintentar</Button></Alert>;
  if (!item) return <Loader aria-label="Cargando accesorio" />;
  return <Stack>
    <Text fw={700}>{item.name}</Text>
    {item.kind === "INDIVIDUAL" && item.purpose !== "COMPONENT"
      ? <ConfigurationTabs accessoryId={accessoryId} />
      : <CommercialProfilePanel accessoryId={accessoryId} />}
  </Stack>;
}

function ConfigurationTabs({ assetId, accessoryId }: { assetId?: string; accessoryId?: string }) {
  const [tab, setTab] = useState<string | null>("physical");
  const [dirty, setDirty] = useState(false);
  return (
    <Stack>
      <Tabs
        value={tab}
        onChange={(next) => {
          if (
            next === tab ||
            (dirty &&
              !window.confirm(
                "Hay cambios sin guardar en esta pestaña. ¿Descartarlos y continuar?",
              ))
          )
            return;
          setDirty(false);
          setTab(next);
        }}
      >
        <Tabs.List grow>
          <Tabs.Tab value="physical">Componentes y accesorios</Tabs.Tab>
          <Tabs.Tab value="commercial">Modalidades de cobro</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === "commercial" ? (
        <CommercialProfilePanel
          key={assetId ?? accessoryId}
          assetId={assetId}
          accessoryId={accessoryId}
          onDirtyChange={setDirty}
        />
      ) : (
        <PhysicalConfigurationPanel
          key={assetId ?? accessoryId}
          assetId={assetId}
          accessoryId={accessoryId}
          onDirtyChange={setDirty}
        />
      )}
    </Stack>
  );
}

function PhysicalConfigurationPanel({
  assetId,
  accessoryId,
  onDirtyChange,
}: {
  assetId?: string;
  accessoryId?: string;
  onDirtyChange?: (dirty: boolean) => void;
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
      onDirtyChange?.(false);
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
              onDirtyChange?.(true);
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
                  onDirtyChange?.(false);
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
