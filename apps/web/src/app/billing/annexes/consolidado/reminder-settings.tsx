"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { api } from "@/lib/api";

type Settings = {
  enabled: boolean;
  ageDays: number;
  repeatDays: number;
  hour: number;
  userIds: string[];
};
type Configuration = {
  settings: Settings;
  users: { id: string; name: string; hasPhone: boolean }[];
};

export default function ReminderSettings({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<Configuration | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!opened) return;
    const ctl = new AbortController();
    setData(null);
    setError("");
    api<Configuration>("/annexes/billing/reminders", {
      signal: ctl.signal,
      cache: "no-store",
    })
      .then((value) => {
        if (!ctl.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!ctl.signal.aborted) setError(e.message);
      });
    return () => ctl.abort();
  }, [opened]);
  function change(patch: Partial<Settings>) {
    if (data) setData({ ...data, settings: { ...data.settings, ...patch } });
  }
  async function save() {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      await api("/annexes/billing/reminders", {
        method: "PUT",
        json: data.settings,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Recordatorios por WhatsApp"
      centered
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        {!data && !error && <Loader size="sm" />}
        {data && (
          <>
            <Switch
              label="Enviar recordatorios a Office"
              checked={data.settings.enabled}
              disabled={saving}
              onChange={(e) => change({ enabled: e.currentTarget.checked })}
            />
            <MultiSelect
              label="Destinatarios de Office"
              placeholder="Seleccionar personal"
              searchable
              data={data.users.map((u) => ({
                value: u.id,
                label: u.name + (u.hasPhone ? "" : " · Sin celular válido"),
                disabled: !u.hasPhone,
              }))}
              value={data.settings.userIds}
              onChange={(userIds) => change({ userIds })}
              disabled={saving}
            />
            <Group grow>
              <NumberInput
                label="Días desde el cierre"
                min={1}
                max={60}
                allowDecimal={false}
                value={data.settings.ageDays}
                onChange={(v) => change({ ageDays: Number(v) })}
                disabled={saving}
              />
              <NumberInput
                label="Repetir cada (días)"
                min={1}
                max={30}
                allowDecimal={false}
                value={data.settings.repeatDays}
                onChange={(v) => change({ repeatDays: Number(v) })}
                disabled={saving}
              />
            </Group>
            <Select
              label="Hora de envío (Colombia)"
              allowDeselect={false}
              value={String(data.settings.hour)}
              data={Array.from({ length: 24 }, (_, i) => ({
                value: String(i),
                label: String(i).padStart(2, "0") + ":00",
              }))}
              onChange={(v) => change({ hour: Number(v) })}
              disabled={saving}
            />
            <Text size="sm" c="dimmed">
              Cada persona recibe un resumen de los cortes cerrados que siguen
              sin número de factura.
            </Text>
            <Group justify="end">
              <Button variant="default" disabled={saving} onClick={onClose}>
                Cancelar
              </Button>
              <Button
                loading={saving}
                disabled={
                  data.settings.ageDays < 1 ||
                  data.settings.repeatDays < 1 ||
                  (data.settings.enabled && !data.settings.userIds.length)
                }
                onClick={save}
              >
                Guardar recordatorios
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
