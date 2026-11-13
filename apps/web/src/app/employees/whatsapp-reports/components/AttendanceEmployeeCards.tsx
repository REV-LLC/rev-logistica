"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  attendanceEmployeeProfile,
  type AttendanceProfile,
} from "@/lib/attendance-employee-profile";
import { api } from "@/lib/api";
import { getCurrentUserRole } from "@/lib/auth";
import AttendanceEvidencePhoto from "./AttendanceEvidencePhoto";

type Employee = {
  id: string;
  name: string;
  lastName: string;
  active: boolean;
  role: string;
  accountRole: string | null;
  journeys: number;
  open: number;
  pendingReview: number;
  reportedHours: number;
  latestWorksite: string | null;
  lastEntry: string | null;
  lastExit: string | null;
};
type Evidence = {
  id: string;
  kind: string;
  description: string;
  occurredAt: string;
  deletedAt: string | null;
  location: { latitude: number; longitude: number } | null;
  evidence: { fileObject: { id: string } }[];
};
type Journal = {
  id: string;
  enteredAt: string;
  leftAt: string | null;
  checkOutReportId: string | null;
  customerWorksite: { worksite: { name: string }; customer: { name: string } };
  checkInReport: Evidence;
  checkOutReport: Evidence | null;
  activityNote: {
    id: string;
    reviewStatus: string | null;
    description: string;
    sourceInvalidatedAt: string | null;
    reviewedSourceExitId: string | null;
  } | null;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const fullName = (e: Employee) => `${e.name} ${e.lastName}`.trim();
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la acción.";
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function presetRange(preset: string) {
  const to = today();
  const d = new Date(`${to}T12:00:00Z`);
  if (preset === "week")
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (preset === "month") d.setUTCDate(1);
  return { from: d.toISOString().slice(0, 10), to };
}
const reviewLabels: Record<string, string> = {
  SUGGESTED: "Sugerencia pendiente",
  CONFIRMED: "Confirmada por oficina",
  CORRECTED: "Corregida por oficina",
  DISMISSED: "Descartada por oficina",
};
export default function AttendanceEmployeeCards() {
  const [range, setRange] = useState(() => presetRange("today"));
  const [preset, setPreset] = useState<string | null>("today");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journalLoading, setJournalLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<AttendanceProfile>("operators");
  const [search, setSearch] = useState("");
  const [withReports, setWithReports] = useState(false);
  const [status, setStatus] = useState<string | null>("all");
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<{
    report: Evidence;
    label: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const [canManage, setCanManage] = useState(false);
  const journalRequest = useRef(0);
  const selected = employees.find((e) => e.id === employeeId);
  const validRange =
    /^\d{4}-\d{2}-\d{2}$/.test(range.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.to);
  const query = new URLSearchParams(range).toString();
  useEffect(() => {
    setCanManage(["ADMIN", "OFFICE"].includes(getCurrentUserRole() ?? ""));
  }, []);
  useEffect(() => {
    if (!validRange) return;
    let active = true;
    setLoading(true);
    setError("");
    void api<{ employees: Employee[] }>(
      `/whatsapp-reports/attendance/employees?${query}`,
    )
      .then((r) => {
        if (active) setEmployees(r.employees);
      })
      .catch((e) => {
        if (active) {
          setEmployees([]);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, validRange, revision]);
  const loadJournals = useCallback(
    async (next?: string) => {
      if (!employeeId || !validRange) return;
      const id = ++journalRequest.current;
      setJournalLoading(true);
      setError("");
      if (!next) {
        setJournals([]);
        setCursor(null);
      }
      try {
        const r = await api<{ journals: Journal[]; nextCursor: string | null }>(
          `/whatsapp-reports/attendance/employees/${employeeId}?${query}${next ? `&cursor=${next}` : ""}`,
        );
        if (id === journalRequest.current) {
          setJournals((previous) =>
            next ? [...previous, ...r.journals] : r.journals,
          );
          setCursor(r.nextCursor);
        }
      } catch (e) {
        if (id === journalRequest.current) setError(errorMessage(e));
      } finally {
        if (id === journalRequest.current) setJournalLoading(false);
      }
    },
    [employeeId, query, validRange],
  );
  useEffect(() => {
    void loadJournals();
    return () => {
      journalRequest.current++;
    };
  }, [loadJournals, revision]);
  async function remove() {
    if (!deleting || saving) return;
    setSaving(true);
    setDeleteError("");
    try {
      await api(`/whatsapp-reports/${deleting.report.id}`, {
        method: "DELETE",
      });
      setDeleting(null);
      setNotice(
        "Marcación eliminada. La jornada se conserva y su sugerencia queda señalada para revisión.",
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const visible = employees.filter(
    (e) =>
      (profile === "all" || attendanceEmployeeProfile(e) === profile) &&
      (!withReports || e.journeys > 0) &&
      (status !== "open" || e.open > 0) &&
      (status !== "pending" || e.pendingReview > 0) &&
      fullName(e)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(
          search
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase(),
        ),
  );
  return (
    <Stack>
      <Group align="flex-end">
        <Select
          label="Período"
          value={preset}
          onChange={(value) => {
            setPreset(value);
            if (value && value !== "custom") setRange(presetRange(value));
          }}
          data={[
            { value: "today", label: "Hoy" },
            { value: "week", label: "Esta semana" },
            { value: "month", label: "Este mes" },
            { value: "custom", label: "Elegir fechas" },
          ]}
        />
        <TextInput
          type="date"
          label="Desde"
          value={range.from}
          onChange={(e) => {
            setPreset("custom");
            setRange({ ...range, from: e.currentTarget.value });
          }}
        />
        <TextInput
          type="date"
          label="Hasta"
          value={range.to}
          onChange={(e) => {
            setPreset("custom");
            setRange({ ...range, to: e.currentTarget.value });
          }}
        />
        <Button
          variant="light"
          onClick={() => setRevision((v) => v + 1)}
          loading={loading || journalLoading}
        >
          Actualizar jornadas
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Horas de presencia reportadas, sin convertirlas automáticamente en horas
        facturables. Fechas y horas de Colombia.
      </Text>
      {!validRange ? (
        <Alert color="yellow">
          Selecciona ambas fechas para consultar las jornadas.
        </Alert>
      ) : null}
      {error ? (
        <Alert color="red" title="No se pudo cargar la asistencia">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert color="green" withCloseButton onClose={() => setNotice("")}>
          {notice}
        </Alert>
      ) : null}
      {employeeId ? (
        <>
          <Group justify="space-between">
            <Button
              variant="subtle"
              onClick={() => {
                setEmployeeId(null);
                setJournals([]);
              }}
            >
              ← Volver a empleados
            </Button>
            <Title order={3}>
              {selected ? fullName(selected) : "Jornadas del empleado"}
            </Title>
          </Group>
          {selected ? (
            <Button
              component={Link}
              variant="light"
              href={`/employees/activities?employeeId=${selected.id}&month=${range.from.slice(0, 7)}&date=${range.from}`}
            >
              Abrir bitácora de {selected.name}
            </Button>
          ) : null}
          {journalLoading && !journals.length ? (
            <Loader aria-label="Cargando jornadas" />
          ) : null}
          {!journalLoading && !journals.length && !error ? (
            <Paper withBorder p="lg">
              <Text>
                No hay jornadas en este período. Esto no indica una ausencia.
              </Text>
            </Paper>
          ) : null}
          {journals.map((a) => {
            const invalid = Boolean(
              a.activityNote?.sourceInvalidatedAt ||
              a.checkInReport.deletedAt ||
              a.checkOutReport?.deletedAt,
            );
            const changed = Boolean(
              a.activityNote &&
              a.activityNote.reviewStatus !== "DISMISSED" &&
              a.activityNote.reviewStatus !== "SUGGESTED" &&
              a.activityNote.reviewedSourceExitId !== a.checkOutReportId,
            );
            return (
              <Paper key={a.id} withBorder p="md" radius="md">
                <Stack>
                  <Group justify="space-between">
                    <div>
                      <Text fw={700}>{a.customerWorksite.worksite.name}</Text>
                      <Text size="sm" c="dimmed">
                        {a.customerWorksite.customer.name}
                      </Text>
                    </div>
                    <Badge
                      color={invalid ? "red" : a.leftAt ? "green" : "orange"}
                    >
                      {invalid
                        ? "Revisar evidencia"
                        : a.leftAt
                          ? "Jornada cerrada"
                          : "Salida pendiente"}
                    </Badge>
                  </Group>
                  {a.leftAt ? (
                    <Text size="sm">
                      Presencia reportada:{" "}
                      {(
                        (new Date(a.leftAt).getTime() -
                          new Date(a.enteredAt).getTime()) /
                        3600000
                      ).toFixed(2)}{" "}
                      h
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      No se calcula duración mientras falte la salida.
                    </Text>
                  )}
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    {[
                      ["Entrada", a.checkInReport],
                      ["Salida", a.checkOutReport],
                    ].map(([label, report]) => {
                      const r = report as Evidence | null;
                      const title = label as string;
                      return (
                        <Paper key={title} withBorder p="sm" radius="sm">
                          <Stack gap="xs">
                            <Text fw={600}>{title}</Text>
                            {r ? (
                              <>
                                <Text size="sm">{date(r.occurredAt)}</Text>
                                {r.deletedAt ? (
                                  <Alert color="red">
                                    Marcación eliminada; se conserva su
                                    trazabilidad.
                                  </Alert>
                                ) : (
                                  <>
                                    {r.location ? (
                                      <Button
                                        component="a"
                                        variant="light"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.location.latitude},${r.location.longitude}`)}`}
                                      >
                                        Ver ubicación en el mapa
                                      </Button>
                                    ) : (
                                      r.evidence.map((e, index) => (
                                        <AttendanceEvidencePhoto
                                          key={e.fileObject.id}
                                          fileId={e.fileObject.id}
                                          label={`Foto de ${title.toLowerCase()}${index ? ` ${index + 1}` : ""}`}
                                        />
                                      ))
                                    )}
                                    {canManage ? (
                                      <Button
                                        variant="subtle"
                                        color="red"
                                        size="xs"
                                        onClick={() => {
                                          setDeleteError("");
                                          setDeleting({
                                            report: r,
                                            label: title,
                                          });
                                        }}
                                      >
                                        Eliminar {title.toLowerCase()}
                                      </Button>
                                    ) : null}
                                  </>
                                )}
                              </>
                            ) : (
                              <Text size="sm" c="dimmed">
                                Pendiente de reportar.
                              </Text>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </SimpleGrid>
                  <Group justify="space-between">
                    <Badge
                      color={
                        invalid || changed
                          ? "orange"
                          : ["CONFIRMED", "CORRECTED"].includes(
                                a.activityNote?.reviewStatus ?? "",
                              )
                            ? "green"
                            : "blue"
                      }
                    >
                      {invalid
                        ? "Evidencia por revisar"
                        : changed
                          ? "Nueva salida: revisar sugerencia"
                          : (reviewLabels[a.activityNote?.reviewStatus ?? ""] ??
                            "Sugerencia por generar")}
                    </Badge>
                    <Button
                      component={Link}
                      variant="light"
                      size="xs"
                      href={`/employees/activities?employeeId=${employeeId}&month=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(new Date(a.enteredAt))}&date=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(a.enteredAt))}`}
                    >
                      Revisar en bitácora
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            );
          })}
          {cursor ? (
            <Button
              loading={journalLoading}
              onClick={() => void loadJournals(cursor)}
            >
              Cargar más jornadas
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Group align="flex-end">
            <Select
              label="Perfil"
              value={profile}
              allowDeselect={false}
              onChange={(value) => {
                if (value) setProfile(value as AttendanceProfile);
              }}
              data={[
                { value: "operators", label: "Operarios" },
                { value: "drivers", label: "Conductores" },
                { value: "office", label: "Oficina y administración" },
                { value: "others", label: "Otros perfiles" },
                { value: "all", label: "Todos los perfiles" },
              ]}
            />
            <TextInput
              label="Buscar empleado"
              placeholder="Nombre del empleado"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Select
              label="Mostrar"
              value={status}
              onChange={setStatus}
              data={[
                { value: "all", label: "Todos" },
                { value: "open", label: "Con salida pendiente" },
                { value: "pending", label: "Con revisión pendiente" },
              ]}
            />
            <Checkbox
              label="Solo con jornadas en el período"
              checked={withReports}
              onChange={(e) => setWithReports(e.currentTarget.checked)}
            />
          </Group>
          {loading ? (
            <Loader aria-label="Cargando empleados y jornadas" />
          ) : !error ? (
            <>
              <Text size="sm" c="dimmed">
                {visible.length} empleados ·{" "}
                {visible.reduce((n, e) => n + e.journeys, 0)} jornadas en el
                período
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {visible.map((e) => (
                  <Paper key={e.id} withBorder p="md" radius="md">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={700}>{fullName(e)}</Text>
                        {!e.active ? (
                          <Badge color="gray">Inactivo</Badge>
                        ) : null}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {e.latestWorksite ?? "Sin obra reportada en el período"}
                      </Text>
                      <Group>
                        <Badge variant="light">{e.journeys} jornadas</Badge>
                        {e.open ? (
                          <Badge color="orange">{e.open} sin salida</Badge>
                        ) : null}
                        {e.pendingReview ? (
                          <Badge color="yellow">
                            {e.pendingReview} por revisar
                          </Badge>
                        ) : null}
                      </Group>
                      <Text size="sm">
                        {e.reportedHours.toFixed(2)} h de presencia reportada
                      </Text>
                      {e.lastEntry ? (
                        <Text size="xs" c="dimmed">
                          Última entrada: {date(e.lastEntry)}
                          {e.lastExit ? ` · Salida: ${date(e.lastExit)}` : ""}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Sin reportes. No se interpreta como ausencia.
                        </Text>
                      )}
                      <Button
                        variant="light"
                        onClick={() => setEmployeeId(e.id)}
                      >
                        Ver jornadas de {e.name}
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </SimpleGrid>
              {!visible.length ? (
                <Text c="dimmed">
                  No hay empleados que coincidan con estos filtros.
                </Text>
              ) : null}
            </>
          ) : null}
        </>
      )}
      <Modal
        opened={Boolean(deleting)}
        onClose={() => {
          if (!saving) setDeleting(null);
        }}
        title="Eliminar marcación"
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
        centered
      >
        {deleting ? (
          <Stack>
            <Text>
              ¿Eliminar esta {deleting.label.toLowerCase()} de{" "}
              {selected ? fullName(selected) : "este empleado"}?
            </Text>
            <Text size="sm">{date(deleting.report.occurredAt)}</Text>
            <Text size="sm">
              La jornada se conserva. Su sugerencia de bitácora se marcará para
              revisar la evidencia.
            </Text>
            {deleteError ? <Alert color="red">{deleteError}</Alert> : null}
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={saving}
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </Button>
              <Button
                color="red"
                loading={saving}
                onClick={() => void remove()}
              >
                Sí, eliminar marcación
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
