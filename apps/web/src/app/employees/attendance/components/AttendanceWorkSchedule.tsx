"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { api } from "@/lib/api";
import {
  WORK_DAYS,
  workScheduleError,
  workScheduleMinutes,
  type WorkPeriod,
  type WorkSchedule,
  type WorkScheduleResponse,
} from "@/lib/work-schedule";
import styles from "./AttendanceWorkSchedule.module.css";

export default function AttendanceWorkSchedule({
  onStateChange,
}: {
  onStateChange: (state: { dirty: boolean; saving: boolean }) => void;
}) {
  const [saved, setSaved] = useState<WorkScheduleResponse | null>(null);
  const [draft, setDraft] = useState<WorkSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const dirty = Boolean(
    draft && saved && JSON.stringify(draft) !== JSON.stringify(saved.schedule),
  );
  const validation = draft ? workScheduleError(draft) : null;

  useEffect(() => {
    onStateChange({ dirty, saving });
  }, [dirty, saving, onStateChange]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<WorkScheduleResponse>("/settings/work-schedule", { cache: "no-store" })
      .then((result) => {
        const invalid = workScheduleError(result.schedule);
        if (invalid) throw new Error(invalid);
        if (active) {
          setSaved(result);
          setDraft(result.schedule);
        }
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el horario.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const updateDay = (dayOfWeek: number, periods: WorkPeriod[]) => {
    setMessage("");
    setDraft((current) =>
      current
        ? {
            days: current.days.map((day) =>
              day.dayOfWeek === dayOfWeek ? { ...day, periods } : day,
            ),
          }
        : current,
    );
  };
  const save = useCallback(async () => {
    if (!draft || workScheduleError(draft) || saving || !dirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<WorkScheduleResponse>(
        "/settings/work-schedule",
        { method: "PATCH", json: { schedule: draft } },
      );
      const invalid = workScheduleError(result.schedule);
      if (invalid) throw new Error(invalid);
      setSaved(result);
      setDraft(result.schedule);
      setMessage("Horario guardado.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el horario.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, saving, dirty]);

  if (loading) return <Loader aria-label="Cargando horario de REV" />;
  if (!draft)
    return (
      <Alert color="red" title="No se pudo cargar el horario">
        <Stack gap="sm">
          <Text>{error}</Text>
          <Button
            variant="light"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar
          </Button>
        </Stack>
      </Alert>
    );
  const total = validation ? null : workScheduleMinutes(draft);
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Hora de Colombia
      </Text>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert color="green" role="status">
          {message}
        </Alert>
      ) : null}
      <div className={styles.days}>
        {[...draft.days]
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map((day) => {
            const name = WORK_DAYS[day.dayOfWeek - 1];
            return (
              <div key={day.dayOfWeek} className={styles.day}>
                <div className={styles.identity}>
                  <Text fw={600}>{name}</Text>
                  <Switch
                    aria-label={`${name}: jornada laboral`}
                    checked={day.periods.length > 0}
                    disabled={saving}
                    onChange={(event) =>
                      updateDay(
                        day.dayOfWeek,
                        event.currentTarget.checked
                          ? [{ start: "", end: "" }]
                          : [],
                      )
                    }
                  />
                </div>
                <div className={styles.periods}>
                  {!day.periods.length ? (
                    <Text size="sm" c="dimmed">
                      Sin jornada
                    </Text>
                  ) : (
                    day.periods.map((period, index) => (
                      <div key={index} className={styles.period}>
                        <TextInput
                          type="time"
                          label="Entrada"
                          aria-label={`${name}: entrada ${index + 1}`}
                          value={period.start}
                          disabled={saving}
                          onChange={(event) =>
                            updateDay(
                              day.dayOfWeek,
                              day.periods.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      start: event.currentTarget.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                        <TextInput
                          type="time"
                          label="Salida"
                          aria-label={`${name}: salida ${index + 1}`}
                          value={period.end}
                          disabled={saving}
                          onChange={(event) =>
                            updateDay(
                              day.dayOfWeek,
                              day.periods.map((item, i) =>
                                i === index
                                  ? { ...item, end: event.currentTarget.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Tooltip label="Quitar franja">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size={32}
                            aria-label={`${name}: quitar franja ${index + 1}`}
                            disabled={saving}
                            onClick={() =>
                              updateDay(
                                day.dayOfWeek,
                                day.periods.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </div>
                    ))
                  )}
                  {day.periods.length === 1 ? (
                    <Tooltip label="Agregar franja">
                      <ActionIcon
                        variant="light"
                        size={32}
                        aria-label={`${name}: agregar franja`}
                        disabled={saving}
                        onClick={() =>
                          updateDay(day.dayOfWeek, [
                            ...day.periods,
                            { start: "", end: "" },
                          ])
                        }
                      >
                        <IconPlus size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
      {validation ? (
        <Text size="sm" c="red" role="alert">
          {validation}
        </Text>
      ) : null}
      <div className={styles.actions}>
        <Text fw={600}>
          Total semanal:{" "}
          {total == null
            ? "--"
            : `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ""}`}
        </Text>
        <Group gap="xs">
          <Button
            variant="subtle"
            disabled={!dirty || saving}
            onClick={() => {
              if (saved) setDraft(saved.schedule);
              setError("");
              setMessage("");
            }}
          >
            Descartar cambios
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            loading={saving}
            disabled={!dirty || Boolean(validation)}
            onClick={() => void save()}
          >
            Guardar horario
          </Button>
        </Group>
      </div>
    </Stack>
  );
}
