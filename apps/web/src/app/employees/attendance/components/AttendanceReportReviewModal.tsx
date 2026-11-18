"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { api } from "@/lib/api";
import type { Journal } from "./AttendanceEmployeeCards";
import AttendanceEvidencePhoto from "./AttendanceEvidencePhoto";

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
  const [action, setAction] = useState("CONFIRM");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const note = journal.activityNote;
  const invalid = Boolean(
    note?.sourceInvalidatedAt ||
    journal.checkInReport?.deletedAt ||
    journal.checkOutReport?.deletedAt,
  );
  const confirmationBlocked =
    !journal.leftAt || invalid || note?.reviewStatus === "DISMISSED";
  async function save() {
    if (!note || saving || (action === "CONFIRM" && confirmationBlocked))
      return;
    setSaving(true);
    setError("");
    try {
      await api(`/employee-activities/${employeeId}/${note.id}/review`, {
        method: "PATCH",
        json: { action },
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
      size="xl"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack>
        <div>
          <Text fw={700}>{employeeName}</Text>
          <Text>{journal.customerWorksite.worksite.name}</Text>
          <Text size="sm" c="dimmed">
            {journal.customerWorksite.customer.name}
          </Text>
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
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
                <Text size="sm">{at ? date(at) : "Pendiente de reportar"}</Text>
                {report?.deletedAt ? (
                  <Alert color="red">
                    Reporte eliminado. Se conserva su trazabilidad.
                  </Alert>
                ) : (
                  <>
                    {report?.location ? (
                      <Button
                        component="a"
                        variant="light"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${report.location.latitude},${report.location.longitude}`)}`}
                      >
                        Ver ubicación
                      </Button>
                    ) : null}
                    {report?.evidence.map((e, index) => (
                      <AttendanceEvidencePhoto
                        key={e.fileObject.id}
                        fileId={e.fileObject.id}
                        label={`Foto de ${label.toLowerCase()} ${index + 1}`}
                      />
                    ))}
                  </>
                )}
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
                    : "Esta revisión ya fue descartada. Una corrección debe realizarse desde la bitácora."}
              </Alert>
            ) : null}
            <SegmentedControl
              fullWidth
              aria-label="Decisión de revisión"
              value={action}
              disabled={saving}
              onChange={setAction}
              data={[
                { value: "CONFIRM", label: "Confirmar" },
                { value: "DISMISS", label: "Descartar" },
              ]}
            />
            {action === "DISMISS" ? (
              <Alert color="yellow">
                Se descartará la sugerencia de bitácora; no se eliminarán las
                marcaciones ni sus evidencias.
              </Alert>
            ) : null}
          </>
        ) : (
          <Alert color="yellow">
            Esta jornada aún no tiene una sugerencia de bitácora disponible para
            revisar. Las marcaciones PWA se revisan en “Revisión de
            marcaciones”.
          </Alert>
        )}
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={onClose}>
            Cerrar
          </Button>
          <Button
            loading={saving}
            color={action === "DISMISS" ? "red" : undefined}
            disabled={!note || (action === "CONFIRM" && confirmationBlocked)}
            onClick={() => void save()}
          >
            {action === "DISMISS" ? "Descartar revisión" : "Confirmar revisión"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
