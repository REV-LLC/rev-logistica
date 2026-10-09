"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import type { ConfigurationLocation } from "./types";

export type ConfigurationNavigation = {
  onConfigurePart: (location: ConfigurationLocation) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onLabelChange?: (label: string) => void;
};

const locationKey = (location: ConfigurationLocation) =>
  location.assetId
    ? `asset:${location.assetId}`
    : location.skuId ? `sku:${location.skuId}` : `accessory:${location.accessoryId}`;

export default function ConfigurationNavigator({
  root,
  renderOwner,
}: {
  root: ConfigurationLocation;
  renderOwner: (
    location: ConfigurationLocation,
    navigation: ConfigurationNavigation,
  ) => ReactNode;
}) {
  const [trail, setTrail] = useState(() => [root]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const current = trail[trail.length - 1];
  const goBack = (index: number) => {
    if (busy || index === trail.length - 1) return;
    if (
      dirty &&
      !window.confirm(
        "Hay cambios sin guardar. ¿Descartarlos y volver al elemento anterior?",
      )
    )
      return;
    setDirty(false);
    setError("");
    setTrail((previous) => previous.slice(0, index + 1));
  };
  const configure = (location: ConfigurationLocation) => {
    if (
      trail.some((item) => locationKey(item) === locationKey(location)) ||
      trail.length > 16
    ) {
      setError(
        "Revisa la configuración: no se permiten ciclos ni más de 16 niveles de piezas.",
      );
      return;
    }
    setDirty(false);
    setError("");
    setTrail((previous) => [...previous, location]);
  };
  return (
    <Stack gap="lg">
      {trail.length > 1 ? (
        <Group gap="xs" aria-label="Ruta del conjunto" style={{ minWidth: 0 }}>
          {trail.slice(0, -1).map((location, index) => (
            <Group
              key={`${locationKey(location)}:${index}`}
              gap="xs"
              wrap="nowrap"
              style={{ maxWidth: "100%" }}
            >
              {index ? (
                <Text c="dimmed" aria-hidden="true">
                  →
                </Text>
              ) : null}
              <Button
                variant="subtle"
                size="xs"
                disabled={busy}
                onClick={() => goBack(index)}
                style={{ maxWidth: 260 }}
              >
                <Text inherit truncate="end">
                  Volver a {labels[locationKey(location)] ?? location.label}
                </Text>
              </Button>
            </Group>
          ))}
        </Group>
      ) : null}
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      <div key={locationKey(current)}>
        {renderOwner(current, {
          onConfigurePart: configure,
          onDirtyChange: setDirty,
          onBusyChange: setBusy,
          onLabelChange: (label) =>
            setLabels((previous) => ({
              ...previous,
              [locationKey(current)]: label,
            })),
        })}
      </div>
    </Stack>
  );
}
