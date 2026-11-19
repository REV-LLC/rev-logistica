"use client";

import { useState } from "react";
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconX, IconPencil } from "@tabler/icons-react";
import { api } from "@/lib/api";
import {
  attendanceLocalTime,
  attendanceCorrectionIso,
} from "@/lib/attendance-review-time";
import type { AttendanceJournal as Journal } from "./attendance-types";
import AttendanceEvidencePhoto from "./AttendanceEvidencePhoto";
import AttendanceLocationMap from "./AttendanceLocationMap";
import { statusLabels } from "@/lib/attendance";
import styles from "./AttendanceReportReviewModal.module.css";

const date = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function AttendanceReportReviewModal({
  journal,
  employeeId,
  employeeName,
  onClose,
  onReviewed,
}: {
  journal: Journal;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const note = journal.activityNote;
  const originalEntry = note?.verifiedEnteredAt ?? journal.enteredAt;
  const originalExit = note?.verifiedLeftAt ?? journal.leftAt;
  const [entry, setEntry] = useState(() => attendanceLocalTime(originalEntry));
  const [exit, setExit] = useState(() => attendanceLocalTime(originalExit));
  const invalid = Boolean(
    note?.sourceInvalidatedAt ||
    journal.checkInReport?.deletedAt ||
    journal.checkOutReport?.deletedAt,
  );
  const confirmationBlocked =
    !journal.leftAt || invalid || note?.reviewStatus === "DISMISSED";
  async function save(action: "CONFIRM" | "DISMISS" | "CORRECT") {
    if (!note || saving || (action === "CONFIRM" && confirmationBlocked))
      return;
    setSaving(true);
    setError("");
    try {
      let correction = {};
      if (action === "CORRECT") {
        const verifiedEnteredAt = attendanceCorrectionIso(entry, originalEntry);
        const verifiedLeftAt = exit
          ? attendanceCorrectionIso(exit, originalExit)
          : null;
        if (journal.leftAt && !verifiedLeftAt)
          throw new Error(
            "Completa la salida corregida de esta jornada cerrada.",
          );
        if (
          verifiedLeftAt &&
          Date.parse(verifiedLeftAt) <= Date.parse(verifiedEnteredAt)
        )
          throw new Error(
            "La salida corregida debe ser posterior a la entrada.",
          );
        correction = { verifiedEnteredAt, verifiedLeftAt };
      }
      await api(`/employee-activities/${employeeId}/${note.id}/review`, {
        method: "PATCH",
        json: { action, ...correction },
      });
      onReviewed();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la revisión.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title="Revisar entrada y salida"
      size="min(1120px, calc(100vw - 24px))"
      xOffset={12}
      yOffset={12}
      classNames={{ content: styles.content, body: styles.body }}
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <div className={styles.layout}>
        <div className={styles.scroll}>
          <Stack gap="sm">
            <div>
              <Text fw={700}>{employeeName}</Text>
              <Text>{journal.customerWorksite.worksite.name}</Text>
              <Text size="sm" c="dimmed">
                {journal.customerWorksite.customer.name}
              </Text>
            </div>
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
              {[
                {
                  label: "Entrada",
                  at: journal.enteredAt,
                  report: journal.checkInReport,
                },
                {
                  label: "Salida",
                  at: journal.leftAt,
                  report: journal.checkOutReport,
                },
              ].map(({ label, at, report }) => (
                <Paper key={label} withBorder p="md">
                  <Stack gap="xs">
                    <Text fw={700}>{label}</Text>
                    <Text size="sm">
                      {at ? date(at) : "Pendiente de reportar"}
                    </Text>
                    {!report?.deletedAt && report ? (
                      <div className={styles.media}>
                        <AttendanceLocationMap
                          compact
                          latitude={report.location?.latitude}
                          longitude={report.location?.longitude}
                          label={`Ubicación de ${label.toLowerCase()} de WhatsApp`}
                        />
                        <Stack gap="xs">
                          {report.evidence.length ? (
                            report.evidence.map((e, index) => (
                              <AttendanceEvidencePhoto
                                compact
                                key={e.fileObject.id}
                                fileId={e.fileObject.id}
                                label={`Foto de ${label.toLowerCase()} ${index + 1}`}
                              />
                            ))
                          ) : (
                            <div className={styles.emptyPhoto}>
                              <Text size="xs" c="dimmed">
                                Sin foto registrada
                              </Text>
                            </div>
                          )}
                        </Stack>
                      </div>
                    ) : null}
                    {(journal.punches ?? [])
                      .filter(
                        (punch) =>
                          punch.kind ===
                          (label === "Entrada" ? "CHECK_IN" : "CHECK_OUT"),
                      )
                      .map((punch) => (
                        <Stack key={punch.id} gap="xs">
                          <div className={styles.media}>
                            <AttendanceLocationMap
                              compact
                              latitude={punch.latitude}
                              longitude={punch.longitude}
                              accuracyMeters={punch.accuracyMeters}
                              label={`Ubicación de ${label.toLowerCase()} de PWA`}
                            />
                            <AttendanceEvidencePhoto
                              compact
                              punchId={punch.id}
                              label={`Selfie de ${label.toLowerCase()}`}
                            />
                          </div>
                          <Text size="sm">
                            {statusLabels[punch.status] ??
                              "Marcación registrada"}{" "}
                            · {date(punch.occurredAt)}
                          </Text>
                        </Stack>
                      ))}
                    {report?.deletedAt ? (
                      <Alert color="red">
                        Reporte eliminado. Se conserva su trazabilidad.
                      </Alert>
                    ) : null}
                    {!report?.location &&
                    !(journal.punches ?? []).some(
                      (punch) =>
                        punch.kind ===
                        (label === "Entrada" ? "CHECK_IN" : "CHECK_OUT"),
                    ) ? (
                      <Text size="sm" c="dimmed">
                        Sin ubicación registrada.
                      </Text>
                    ) : null}
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
            {journal.leftAt ? (
              <Text size="sm">
                Presencia reportada:{" "}
                {Math.max(
                  0,
                  (Date.parse(journal.leftAt) - Date.parse(journal.enteredAt)) /
                    3600000,
                ).toFixed(2)}{" "}
                h
              </Text>
            ) : null}
            {note ? (
              <>
                <Badge variant="light">
                  {{
                    SUGGESTED: "Pendiente de revisión",
                    CONFIRMED: "Confirmada",
                    CORRECTED: "Corregida",
                    DISMISSED: "Descartada",
                  }[note.reviewStatus ?? ""] ?? "Pendiente de revisión"}
                </Badge>
                {note.verifiedEnteredAt ? (
                  <Stack gap={4}>
                    <Text size="sm" fw={600}>
                      Horas revisadas
                    </Text>
                    <Text size="sm">
                      Entrada: {date(note.verifiedEnteredAt)}
                    </Text>
                    <Text size="sm">
                      Salida:{" "}
                      {note.verifiedLeftAt
                        ? date(note.verifiedLeftAt)
                        : "Pendiente"}
                    </Text>
                  </Stack>
                ) : null}
                {note.lastCorrection ? (
                  <Text size="sm" c="dimmed">
                    Última corrección: {note.lastCorrection.name} ·{" "}
                    {date(note.lastCorrection.at)}
                  </Text>
                ) : null}
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {note.description}
                </Text>
                {confirmationBlocked ? (
                  <Alert color="yellow">
                    {invalid
                      ? "La evidencia fue invalidada. No se puede confirmar esta jornada."
                      : !journal.leftAt
                        ? "Falta la salida. No se puede confirmar una jornada abierta."
                        : "Esta revisión fue descartada. Puedes recuperarla corrigiendo sus horas."}
                  </Alert>
                ) : null}
                {action === "CORRECT" ? (
                  <Stack gap="sm">
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <TextInput
                        type="datetime-local"
                        label="Entrada corregida"
                        required
                        value={entry}
                        disabled={saving}
                        onChange={(event) =>
                          setEntry(event.currentTarget.value)
                        }
                      />
                      <TextInput
                        type="datetime-local"
                        label="Salida corregida"
                        required={Boolean(journal.leftAt)}
                        value={exit}
                        disabled={saving}
                        onChange={(event) => setExit(event.currentTarget.value)}
                      />
                    </SimpleGrid>
                    <Text size="sm" c="dimmed">
                      Hora de Colombia. Se conservarán los reportes originales y
                      el historial de cambios con su responsable.
                    </Text>
                    <Group justify="flex-end">
                      <Button
                        variant="subtle"
                        disabled={saving}
                        onClick={() => setAction(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        color="yellow"
                        loading={saving}
                        onClick={() => void save("CORRECT")}
                      >
                        Guardar corrección
                      </Button>
                    </Group>
                  </Stack>
                ) : null}
                {action === "DISMISS" ? (
                  <Alert color="red" title="Rechazar revisión">
                    <Stack gap="sm">
                      <Text size="sm">
                        Se descartará la sugerencia de bitácora; no se
                        eliminarán las marcaciones ni sus evidencias.
                      </Text>
                      <Group justify="flex-end">
                        <Button
                          variant="subtle"
                          disabled={saving}
                          onClick={() => setAction(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          color="red"
                          loading={saving}
                          onClick={() => void save("DISMISS")}
                        >
                          Confirmar rechazo
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                ) : null}
              </>
            ) : (
              <Alert color="yellow">
                Esta jornada aún no tiene una sugerencia de bitácora disponible
                para revisar. Las marcaciones PWA se revisan en “Revisión de
                marcaciones”.
              </Alert>
            )}
            {error ? (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            ) : null}
          </Stack>
        </div>
        <Group
          className={styles.footer}
          justify="center"
          gap="xl"
          aria-label="Acciones de la revisión"
        >
          {[
            {
              label: "Aprobar",
              color: "green",
              value: "CONFIRM",
              icon: IconCheck,
            },
            { label: "Rechazar", color: "red", value: "DISMISS", icon: IconX },
            {
              label: "Corregir",
              color: "yellow",
              value: "CORRECT",
              icon: IconPencil,
            },
          ].map(({ label, color, value, icon: Icon }) => (
            <Stack key={value} gap={6} align="center" w={64}>
              <Tooltip label={label}>
                <ActionIcon
                  aria-label={label}
                  color={color}
                  radius="xl"
                  size={52}
                  style={{
                    width: 52,
                    minWidth: 52,
                    maxWidth: 52,
                    height: 52,
                    minHeight: 52,
                    maxHeight: 52,
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                  variant="filled"
                  loading={saving && action === value}
                  disabled={
                    !note ||
                    saving ||
                    (value === "CONFIRM" && confirmationBlocked)
                  }
                  onClick={() => {
                    setError("");
                    setAction(value);
                    if (value === "CONFIRM") void save("CONFIRM");
                  }}
                >
                  <Icon size={24} aria-hidden="true" />
                </ActionIcon>
              </Tooltip>
              <Text size="xs" fw={600}>
                {label}
              </Text>
            </Stack>
          ))}
        </Group>
      </div>
    </Modal>
  );
}
