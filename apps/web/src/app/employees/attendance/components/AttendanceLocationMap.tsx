"use client";

import { Button, Stack, Text } from "@mantine/core";

export default function AttendanceLocationMap({
  latitude,
  longitude,
  label,
  accuracyMeters,
  compact = false,
}: {
  latitude?: number | null;
  longitude?: number | null;
  label: string;
  accuracyMeters?: number | null;
  compact?: boolean;
}) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return (
      <Text size="sm" c="dimmed">
        Sin ubicación registrada.
      </Text>
    );
  }
  const query = `${latitude},${longitude}`;
  return (
    <Stack gap={compact ? 6 : "xs"}>
      <iframe
        title={label}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.google.com/maps?${new URLSearchParams({ q: query, z: "17", output: "embed" })}`}
        style={{
          width: "100%",
          height: compact ? 160 : 240,
          border: 0,
          borderRadius: 8,
        }}
      />
      <Button
        component="a"
        variant="light"
        size={compact ? "xs" : "sm"}
        target="_blank"
        rel="noopener noreferrer"
        href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`}
      >
        Abrir en Google Maps
      </Button>
      {typeof accuracyMeters === "number" &&
      Number.isFinite(accuracyMeters) &&
      accuracyMeters >= 0 ? (
        <Text size="xs" c="dimmed">
          Precisión del GPS: {Math.round(accuracyMeters)} m
        </Text>
      ) : null}
    </Stack>
  );
}
