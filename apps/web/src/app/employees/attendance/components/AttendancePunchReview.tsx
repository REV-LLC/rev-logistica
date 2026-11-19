"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { api } from "@/lib/api";
import {
  type AttendancePunch,
  attendanceDate,
  siteLabel,
  statusLabels,
  reasonLabels,
} from "@/lib/attendance";
import AttendanceLocationMap from "./AttendanceLocationMap";
import AttendanceEvidencePhoto from "./AttendanceEvidencePhoto";

export default function AttendancePunchReview() {
  const [kind, setKind] = useState("CHECK_IN");
  const [status, setStatus] = useState<string | null>(null);
  const [items, setItems] = useState<AttendancePunch[]>([]);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AttendancePunch | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const epoch = useRef(0);
  const query = new URLSearchParams({
    kind,
    ...(status ? { status } : {}),
  }).toString();
  useEffect(() => {
    const request = ++epoch.current;
    const controller = new AbortController();
    setLoading(true);
    setMoreBusy(false);
    setError("");
    setHasMore(false);
    void api<AttendancePunch[]>(`/attendance/punches?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((rows) => {
        if (request === epoch.current) {
          setItems(rows);
          setLoadedQuery(query);
          setHasMore(rows.length === 50);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && request === epoch.current)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar las marcaciones.",
          );
      })
      .finally(() => {
        if (request === epoch.current) setLoading(false);
      });
    return () => {
      controller.abort();
      epoch.current++;
    };
  }, [query, revision]);
  async function more() {
    if (!items.length || moreBusy || loading || loadedQuery !== query) return;
    const request = epoch.current;
    setMoreBusy(true);
    setError("");
    try {
      const rows = await api<AttendancePunch[]>(
        `/attendance/punches?${query}&cursor=${encodeURIComponent(items[items.length - 1].id)}`,
        { cache: "no-store" },
      );
      if (request === epoch.current) {
        setItems((previous) => [...previous, ...rows]);
        setHasMore(rows.length === 50);
      }
    } catch (e) {
      if (request === epoch.current) setError((e as Error).message);
    } finally {
      if (request === epoch.current) setMoreBusy(false);
    }
  }
  async function decide(decision: "APPROVED" | "REJECTED") {
    if (
      !selected ||
      selected.status !== "PENDING" ||
      saving ||
      note.trim().length < 5
    )
      return;
    setSaving(true);
    setReviewError("");
    try {
      await api(`/attendance/punches/${selected.id}/review`, {
        method: "PATCH",
        json: { decision, note: note.trim() },
      });
      setSelected(null);
      setNote("");
      setRevision((value) => value + 1);
    } catch (e) {
      setReviewError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const visible =
    loadedQuery === query ? items.filter((item) => item.kind === kind) : [];
  return (
    <Stack>
      <Group align="end">
        <Select
          label="Tipo de marcación"
          value={kind}
          allowDeselect={false}
          onChange={(value) => {
            if (value) setKind(value);
          }}
          data={[
            { value: "CHECK_IN", label: "Entradas" },
            { value: "CHECK_OUT", label: "Salidas" },
          ]}
        />
        <Select
          label="Estado"
          placeholder="Todos"
          clearable
          value={status}
          onChange={setStatus}
          data={Object.entries(statusLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Button
          variant="light"
          onClick={() => setRevision((value) => value + 1)}
        >
          Actualizar
        </Button>
      </Group>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Loader aria-label="Cargando marcaciones" />
      ) : !visible.length && !error ? (
        <Text c="dimmed">
          No hay {kind === "CHECK_IN" ? "entradas" : "salidas"} para este
          filtro.
        </Text>
      ) : (
        visible.map((punch) => (
          <Paper
            key={punch.id}
            withBorder
            p="md"
            radius="md"
            component="article"
            aria-label={`Marcación de ${punch.employee.name} ${punch.employee.lastName}`}
          >
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700}>
                  {punch.employee.name} {punch.employee.lastName} ·{" "}
                  {kind === "CHECK_IN" ? "Entrada" : "Salida"}
                </Text>
                <Badge
                  color={
                    punch.status === "PENDING"
                      ? "yellow"
                      : punch.status === "REJECTED"
                        ? "red"
                        : "green"
                  }
                >
                  {statusLabels[punch.status] ?? punch.status}
                </Badge>
              </Group>
              <Text>{siteLabel(punch.customerWorksite)}</Text>
              <Text size="sm">
                {attendanceDate(punch.occurredAt)} · Precisión:{" "}
                {Math.round(punch.accuracyMeters)} m
                {punch.distanceMeters != null
                  ? ` · Distancia: ${Math.round(punch.distanceMeters)} m`
                  : ""}
              </Text>
              {punch.reasons.length ? (
                <Text size="sm" c="dimmed">
                  {punch.reasons
                    .map((reason) => reasonLabels[reason] ?? reason)
                    .join(" · ")}
                </Text>
              ) : null}
              {punch.reviewNote ? (
                <Text size="sm">Revisión: {punch.reviewNote}</Text>
              ) : null}
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => {
                    setSelected(punch);
                    setReviewing(false);
                    setReviewError("");
                  }}
                >
                  Ver marcación
                </Button>
                {punch.status === "PENDING" ? (
                  <Button
                    size="xs"
                    onClick={() => {
                      setSelected(punch);
                      setReviewing(true);
                      setNote("");
                      setReviewError("");
                    }}
                  >
                    Revisar
                  </Button>
                ) : null}
              </Group>
            </Stack>
          </Paper>
        ))
      )}
      {hasMore && !loading ? (
        <Button variant="light" loading={moreBusy} onClick={() => void more()}>
          Cargar más
        </Button>
      ) : null}
      <Modal
        opened={Boolean(selected)}
        onClose={() => {
          if (!saving) setSelected(null);
        }}
        title={reviewing ? "Revisar marcación" : "Detalle de la marcación"}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
      >
        {selected ? (
          <Stack>
            <Text fw={600}>
              {selected.employee.name} {selected.employee.lastName} ·{" "}
              {selected.kind === "CHECK_IN" ? "Entrada" : "Salida"}
            </Text>
            <Text size="sm">
              {attendanceDate(selected.occurredAt)} ·{" "}
              {statusLabels[selected.status] ?? selected.status}
            </Text>
            <AttendanceLocationMap
              latitude={selected.latitude}
              longitude={selected.longitude}
              accuracyMeters={selected.accuracyMeters}
              label="Ubicación de la marcación"
            />
            <AttendanceEvidencePhoto
              punchId={selected.id}
              label="Selfie de la marcación"
            />
            {reviewing ? (
              <>
                <Text size="sm">
                  La decisión conserva la jornada y la evidencia originales.
                  Rechazar no borra la entrada ni la salida.
                </Text>
                <Textarea
                  label="Motivo de la decisión"
                  minRows={3}
                  value={note}
                  disabled={saving}
                  onChange={(event) => setNote(event.currentTarget.value)}
                  maxLength={1000}
                />
                {reviewError ? (
                  <Alert color="red" role="alert">
                    {reviewError}
                  </Alert>
                ) : null}
                <Group>
                  <Button
                    loading={saving}
                    disabled={note.trim().length < 5}
                    onClick={() => void decide("APPROVED")}
                  >
                    Aprobar
                  </Button>
                  <Button
                    color="red"
                    loading={saving}
                    disabled={note.trim().length < 5}
                    onClick={() => void decide("REJECTED")}
                  >
                    Rechazar
                  </Button>
                </Group>
              </>
            ) : null}
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
