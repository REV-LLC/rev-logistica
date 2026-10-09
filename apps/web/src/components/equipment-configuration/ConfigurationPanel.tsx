"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Loader, Stack, Tabs, Text } from "@mantine/core";
import { api } from "@/lib/api";
import CommercialProfilePanel from "../commercial-profiles/CommercialProfilePanel";
import type { Accessory } from "../accessories/types";
import ConfigurationEditor from "./ConfigurationEditor";
import ConfigurationNavigator, {
  type ConfigurationNavigation,
} from "./ConfigurationNavigator";
import {
  type EquipmentConfiguration,
  configurationError,
  configurationPayload,
  configurationPartLocation,
  type ConfigurationLocation,
} from "./types";
import classes from "./ConfigurationEditor.module.css";

export default function ConfigurationPanel({
  assetId,
  accessoryId,
  physicalOnly = false,
}: {
  assetId?: string;
  accessoryId?: string;
  physicalOnly?: boolean;
}) {
  if (!assetId && !accessoryId)
    return (
      <Alert color="red">Selecciona el elemento que quieres configurar.</Alert>
    );
  const root: ConfigurationLocation = accessoryId
    ? { accessoryId, label: "Accesorio principal" }
    : { assetId: assetId!, label: "Equipo principal" };
  return <ConfigurationNavigator key={assetId ?? accessoryId} root={root}
    renderOwner={(location, navigation) => renderOwner(location, navigation, physicalOnly && location.assetId === assetId)} />;
}

function renderOwner(
  location: ConfigurationLocation,
  navigation: ConfigurationNavigation,
  physicalOnly = false,
) {
  if (location.skuId) return <CommercialProfilePanel skuId={location.skuId}
    onDirtyChange={navigation.onDirtyChange} onBusyChange={navigation.onBusyChange} />;
  return location.accessoryId ? (
    <AccessoryConfigurationPanel
      accessoryId={location.accessoryId}
      {...navigation}
    />
  ) : (
    <ConfigurationTabs assetId={location.assetId} physicalOnly={physicalOnly} {...navigation} />
  );
}

function AccessoryConfigurationPanel({
  accessoryId,
  ...navigation
}: { accessoryId: string } & ConfigurationNavigation) {
  const [item, setItem] = useState<Accessory>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Accessory>(`/accessories/${accessoryId}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setItem(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [accessoryId, revision]);
  if (error)
    return (
      <Alert color="red">
        {error}
        <Button onClick={() => setRevision((value) => value + 1)}>
          Reintentar
        </Button>
      </Alert>
    );
  if (!item) return <Loader aria-label="Cargando accesorio" />;
  return (
    <Stack>
      {item.kind !== "INDIVIDUAL" || item.purpose === "COMPONENT" ? (
        <Text fw={700}>{item.name}</Text>
      ) : null}
      {item.kind === "INDIVIDUAL" && item.purpose !== "COMPONENT" ? (
        <ConfigurationTabs accessoryId={accessoryId} {...navigation} />
      ) : (
        <>
          <CommercialProfilePanel
            accessoryId={accessoryId}
            onDirtyChange={navigation.onDirtyChange}
            onBusyChange={navigation.onBusyChange}
          />
        </>
      )}
    </Stack>
  );
}

function ConfigurationTabs({
  assetId,
  accessoryId,
  onDirtyChange,
  physicalOnly = false,
  ...navigation
}: { assetId?: string; accessoryId?: string; physicalOnly?: boolean } & ConfigurationNavigation) {
  const [tab, setTab] = useState<string | null>("physical");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const markLabel = (name: string) => {
    setLabel(name);
    navigation.onLabelChange?.(name);
  };
  const markDirty = useCallback(
    (next: boolean) => {
      setDirty(next);
      onDirtyChange(next);
    },
    [onDirtyChange],
  );
  const markBusy = (next: boolean) => {
    setBusy(next);
    navigation.onBusyChange(next);
  };
  return (
    <Stack>
      {label ? (
        <Text component="h1" fw={700} size="28px" m={0}>
          {label}
        </Text>
      ) : null}
      {!physicalOnly ? <Tabs
        value={tab}
        onChange={(next) => {
          if (
            busy ||
            next === tab ||
            (dirty &&
              !window.confirm(
                "Hay cambios sin guardar en esta pestaña. ¿Descartarlos y continuar?",
              ))
          )
            return;
          markDirty(false);
          setTab(next);
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="physical" disabled={busy}>
            Implementos
          </Tabs.Tab>
          <Tabs.Tab value="commercial" disabled={busy}>
            Modalidades de cobro
          </Tabs.Tab>
        </Tabs.List>
      </Tabs> : null}
      {tab === "commercial" ? (
        <CommercialProfilePanel
          key={assetId ?? accessoryId}
          assetId={assetId}
          accessoryId={accessoryId}
          onDirtyChange={markDirty}
          onBusyChange={markBusy}
        />
      ) : (
        <PhysicalConfigurationPanel
          key={assetId ?? accessoryId}
          assetId={assetId}
          accessoryId={accessoryId}
          onDirtyChange={markDirty}
          dirty={dirty}
          {...navigation}
          onLabelChange={markLabel}
          onBusyChange={markBusy}
        />
      )}
    </Stack>
  );
}

function PhysicalConfigurationPanel({
  assetId,
  accessoryId,
  onDirtyChange,
  onConfigurePart,
  onBusyChange,
  dirty,
  onLabelChange,
}: {
  assetId?: string;
  accessoryId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onConfigurePart: ConfigurationNavigation["onConfigurePart"];
  onBusyChange: ConfigurationNavigation["onBusyChange"];
  dirty: boolean;
  onLabelChange?: (label: string) => void;
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
        if (!controller.signal.aborted) {
          setValue(data);
          if (data.parent?.name) onLabelChange?.(data.parent.name);
        }
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
    if (!value || inFlight.current) return null;
    const issue = configurationError(value);
    if (issue) {
      setError(issue);
      return null;
    }
    inFlight.current = true;
    setSaving(true);
    onBusyChange(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api<EquipmentConfiguration>(route, {
        method: "PUT",
        json: configurationPayload(value),
      });
      const persisted = { ...value, ...saved };
      setValue(persisted);
      onDirtyChange?.(false);
      setSuccess("Configuración guardada.");
      return persisted;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return null;
    } finally {
      inFlight.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  };
  const configurePart = async (rowId: string) => {
    if (inFlight.current || !value) return;
    const persisted = dirty ? await save() : value;
    if (!persisted) return;
    const row = persisted.entries.find((item) => item.id === rowId);
    const location = row ? configurationPartLocation(row) : null;
    if (!location) {
      setError(
        "Guarda primero esta pieza para obtener su identidad y configurar sus relaciones.",
      );
      return;
    }
    onConfigurePart(location);
  };
  return (
    <Stack>
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
          <div className={classes.surface}>
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
              onConfigurePart={(rowId) => void configurePart(rowId)}
            />
            <div className={classes.actions}>
              <Button
                variant="default"
                disabled={saving || !dirty}
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
                Cancelar
              </Button>
              <Button
                loading={saving}
                disabled={!dirty}
                onClick={() => void save()}
              >
                Guardar cambios
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Button onClick={() => setReload((r) => r + 1)}>Reintentar</Button>
      )}
    </Stack>
  );
}
