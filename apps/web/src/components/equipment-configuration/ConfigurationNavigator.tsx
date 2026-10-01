"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import type { ConfigurationLocation } from "./types";

export type ConfigurationNavigation = {
  onConfigurePart: (location: ConfigurationLocation) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
};

const locationKey = (location: ConfigurationLocation) =>
  location.assetId
    ? `asset:${location.assetId}`
    : `accessory:${location.accessoryId}`;

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
      <Group gap="xs" aria-label="Ruta del conjunto" style={{ minWidth: 0 }}>
        {trail.map((location, index) => (
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
              variant={index === trail.length - 1 ? "light" : "subtle"}
              size="xs"
              disabled={busy}
              aria-current={index === trail.length - 1 ? "step" : undefined}
              onClick={() => goBack(index)}
              style={{ maxWidth: 260 }}
            >
              <Text inherit truncate="end">
                {location.label}
              </Text>
            </Button>
          </Group>
        ))}
      </Group>
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
        })}
      </div>
    </Stack>
  );
}
