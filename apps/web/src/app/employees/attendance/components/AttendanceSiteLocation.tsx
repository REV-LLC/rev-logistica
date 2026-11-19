"use client";
import { useState } from "react";
import { Button, Group, NumberInput, Paper, Stack, Text } from "@mantine/core";
import { api } from "@/lib/api";
import { type AttendanceSite, siteLabel } from "@/lib/attendance";

export default function AttendanceSiteLocation({
  site,
  onSaved,
}: {
  site: AttendanceSite;
  onSaved: () => Promise<void>;
}) {
  const [lat, setLat] = useState<string | number>(
    site.worksite.attendanceLatitude ?? "",
  );
  const [lon, setLon] = useState<string | number>(
    site.worksite.attendanceLongitude ?? "",
  );
  const [radius, setRadius] = useState<string | number>(
    site.worksite.attendanceRadiusMeters,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/attendance/sites/${site.id}`, {
        method: "PATCH",
        json: {
          latitude: Number(lat),
          longitude: Number(lon),
          radiusMeters: Number(radius),
        },
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Text fw={600}>{siteLabel(site)}</Text>
        <Group grow align="end">
          <NumberInput
            label="Latitud"
            value={lat}
            onChange={setLat}
            min={-90}
            max={90}
            decimalScale={7}
            disabled={busy}
          />
          <NumberInput
            label="Longitud"
            value={lon}
            onChange={setLon}
            min={-180}
            max={180}
            decimalScale={7}
            disabled={busy}
          />
          <NumberInput
            label="Radio (metros)"
            value={radius}
            onChange={setRadius}
            min={20}
            max={5000}
            allowDecimal={false}
            disabled={busy}
          />
        </Group>
        <Text size="xs" c="dimmed">
          La ubicación se comparte entre los clientes vinculados a esta misma
          obra.
        </Text>
        {error ? <Text c="red">{error}</Text> : null}
        <Button
          variant="light"
          loading={busy}
          disabled={lat === "" || lon === "" || radius === ""}
          onClick={() => void save()}
        >
          Guardar ubicación
        </Button>
      </Stack>
    </Paper>
  );
}
