"use client";
import { attendanceJournalTiming } from "@/lib/attendance-journal-timing";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  attendanceEmployeeHref,
  attendanceOverviewHref,
} from "@/lib/attendance-navigation";
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
  Tooltip,
} from "@mantine/core";
import {
  attendanceEmployeeProfile,
  type AttendanceProfile,
} from "@/lib/attendance-employee-profile";
import { api } from "@/lib/api";
import { getCurrentUserRole } from "@/lib/auth";
import { IconNotebook } from "@tabler/icons-react";
import {
  EmployeeCardIdentity,
  getEmployeeCardFullName as fullName,
} from "@/components/EmployeeCard";
import {
  attendancePresetRange,
  attendanceDayTitle,
} from "@/lib/attendance-period";
import styles from "./AttendanceEmployeeCards.module.css";
import AttendanceEvidencePhoto from "./AttendanceEvidencePhoto";
import AttendanceReportReviewModal from "./AttendanceReportReviewModal";
import AttendanceEmployeeCard from "./AttendanceEmployeeCard";
import { attendanceShortDate as date } from "@/lib/attendance";
import type {
  AttendanceEmployee as Employee,
  AttendanceEvidence as Evidence,
  AttendanceJournal as Journal,
} from "./attendance-types";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la acción.";
const validDay = (value: string | null) =>
  Boolean(
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
  );
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function presetRange(preset: string) {
  return attendancePresetRange(preset, today());
}
const reviewLabels: Record<string, string> = {
  SUGGESTED: "Sugerencia pendiente",
  CONFIRMED: "Confirmada por oficina",
  CORRECTED: "Corregida por oficina",
  DISMISSED: "Descartada por oficina",
};
export default function AttendanceEmployeeCards({
  initialEmployeeId = null,
  initialDate = null,
  initialFrom = null,
  initialTo = null,
}: {
  initialEmployeeId?: string | null;
  initialDate?: string | null;
  initialFrom?: string | null;
  initialTo?: string | null;
}) {
  const router = useRouter();
  const requestedDate = validDay(initialDate) ? initialDate : null;
  const requestedRange =
    initialFrom &&
    initialTo &&
    validDay(initialFrom) &&
    validDay(initialTo) &&
    initialFrom <= initialTo
      ? { from: initialFrom, to: initialTo }
      : null;
  const [range, setRange] = useState(() =>
    requestedDate
      ? { from: requestedDate, to: requestedDate }
      : (requestedRange ?? presetRange(initialEmployeeId ? "last15" : "month")),
  );
  const [preset, setPreset] = useState<string | null>(
    requestedDate || requestedRange
      ? "custom"
      : initialEmployeeId
        ? "last15"
        : "month",
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const employeeId = initialEmployeeId;
  const [journals, setJournals] = useState<Journal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journalLoading, setJournalLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<AttendanceProfile>("all");
  const [search, setSearch] = useState("");
  const [withReports, setWithReports] = useState(false);
  const [status, setStatus] = useState<string | null>("all");
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<{
    report: Evidence;
    label: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState<Journal | null>(null);
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
            { value: "last15", label: "Últimos 15 días" },
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
          <Button
            component={Link}
            href={attendanceOverviewHref(range)}
            variant="subtle"
            style={{ alignSelf: "flex-start" }}
          >
            ← Volver a empleados
          </Button>
          {selected ? (
            <div className={styles.employeeHeader}>
              <EmployeeCardIdentity employee={selected} showRole={false} />
              <Tooltip label={`Abrir bitácora de ${fullName(selected)}`}>
                <Button
                  component={Link}
                  variant="light"
                  radius="md"
                  className={styles.journalButton}
                  aria-label={`Abrir bitácora de ${fullName(selected)}`}
                  href={`/employees/activities?employeeId=${selected.id}&month=${range.from.slice(0, 7)}&date=${range.from}`}
                >
                  <IconNotebook size={20} aria-hidden="true" />
                  <span className={styles.journalButtonText}>
                    <span className={styles.journalButtonVerb}>Abrir </span>
                    bitácora
                  </span>
                </Button>
              </Tooltip>
            </div>
          ) : (
            <Title order={3}>Jornadas del empleado</Title>
          )}
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
            const timing = attendanceJournalTiming(a);
            const invalid = Boolean(
              a.activityNote?.sourceInvalidatedAt ||
              a.checkInReport?.deletedAt ||
              a.checkOutReport?.deletedAt,
            );
            const changed = Boolean(
              a.activityNote &&
              a.activityNote.reviewStatus !== "DISMISSED" &&
              a.activityNote.reviewStatus !== "SUGGESTED" &&
              a.activityNote.reviewedSourceExitId !== a.checkOutReportId,
            );
            return (
              <Paper
                key={a.id}
                component="article"
                aria-label={`Jornada de ${date(timing.enteredAt)}`}
                withBorder
                p="md"
                radius="md"
              >
                <Stack>
                  <Group justify="space-between">
                    <Title order={3} className={styles.journeyDate}>
                      <time
                        dateTime={timing.enteredAt}
                        aria-label={date(timing.enteredAt)}
                      >
                        {attendanceDayTitle(timing.enteredAt)}
                      </time>
                    </Title>
                    <Badge
                      color={
                        invalid ? "red" : timing.leftAt ? "green" : "orange"
                      }
                    >
                      {invalid
                        ? "Revisar evidencia"
                        : timing.leftAt
                          ? "Jornada cerrada"
                          : "Salida pendiente"}
                    </Badge>
                  </Group>
                  <Stack gap={3}>
                    <Text fw={600}>{a.customerWorksite.worksite.name}</Text>
                    <Text size="sm" c="dimmed">
                      {a.customerWorksite.customer.name}
                    </Text>
                  </Stack>
                  {timing.leftAt ? (
                    <Text size="sm">
                      Presencia reportada: {timing.hours.toFixed(2)} h
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
                      const at =
                        title === "Entrada" ? timing.enteredAt : timing.leftAt;
                      const originalAt =
                        title === "Entrada" ? a.enteredAt : a.leftAt;
                      return (
                        <Paper key={title} withBorder p="sm" radius="sm">
                          <Stack gap="xs">
                            <Text fw={600}>{title}</Text>
                            {r ? (
                              <>
                                <Text size="sm">
                                  {at ? date(at) : "Pendiente de reportar."}
                                </Text>
                                {timing.corrected && at !== originalAt ? (
                                  <Text size="xs" c="dimmed">
                                    Registro original: {date(r.occurredAt)}
                                  </Text>
                                ) : null}
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
                                {at ? date(at) : "Pendiente de reportar."}
                                {timing.corrected &&
                                originalAt &&
                                at !== originalAt
                                  ? ` (original: ${date(originalAt)})`
                                  : ""}
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
                        : !timing.leftAt
                          ? "En curso"
                          : changed
                            ? "Nueva salida: revisar sugerencia"
                            : (reviewLabels[
                                a.activityNote?.reviewStatus ?? ""
                              ] ?? "Sugerencia por generar")}
                    </Badge>
                    {canManage ? (
                      <Button
                        variant="light"
                        size="xs"
                        onClick={() => setReviewing(a)}
                      >
                        Revisar entrada y salida
                      </Button>
                    ) : null}
                  </Group>
                  {a.activityNote?.reviewStatus === "CORRECTED" &&
                  a.activityNote.verifiedEnteredAt ? (
                    <Stack gap={3}>
                      <Text size="sm">
                        Entrada corregida:{" "}
                        {date(a.activityNote.verifiedEnteredAt)}
                      </Text>
                      <Text size="sm">
                        Salida corregida:{" "}
                        {a.activityNote.verifiedLeftAt
                          ? date(a.activityNote.verifiedLeftAt)
                          : "Pendiente"}
                      </Text>
                      {a.activityNote.lastCorrection ? (
                        <Text size="xs" c="dimmed">
                          Corregido por {a.activityNote.lastCorrection.name} ·{" "}
                          {date(a.activityNote.lastCorrection.at)}
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
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
              <SimpleGrid className={styles.employeeGrid}>
                {visible.map((e) => (
                  <AttendanceEmployeeCard
                    key={e.id}
                    employee={e}
                    onSelect={(id) =>
                      router.push(attendanceEmployeeHref(id, range))
                    }
                  />
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
      {reviewing && employeeId ? (
        <AttendanceReportReviewModal
          key={reviewing.id}
          journal={reviewing}
          employeeId={employeeId}
          employeeName={selected ? fullName(selected) : "Empleado"}
          onClose={() => setReviewing(null)}
          onReviewed={() => {
            setReviewing(null);
            setNotice("Revisión guardada correctamente.");
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
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
