"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { api, apiBlob } from "@/lib/api";

type Kind = "DAMAGE" | "HOUR_METER" | "REQUEST" | "CHECK_IN" | "CHECK_OUT";
const labels: Record<Kind, string> = {
  DAMAGE: "Daños",
  HOUR_METER: "Horómetros",
  REQUEST: "Peticiones",
  CHECK_IN: "Entradas",
  CHECK_OUT: "Salidas",
};
type Report = {
  id: string;
  kind: Kind;
  description: string;
  hours: string | null;
  location?: { latitude: number; longitude: number; receivedAt: string; sentAt: string } | null;
  occurredAt: string;
  status: string;
  resolution: string | null;
  employee: { name: string; lastName: string };
  asset: {
    internalNumber: number;
    sku: { name: string };
  } | null;
  vehicle: { plate: string } | null;
  customerWorksite: {
    worksite: { name: string };
    customer: { name: string };
  } | null;
  evidence: { fileObject: { id: string; originalName: string | null } }[];
  alertRecipients: {
    id: string;
    name: string;
    status: string;
    error: string | null;
  }[];
};
type Health = {
  enabled: boolean;
  aiConfigured: boolean;
  metaConfigured: boolean;
  actorConfigured: boolean;
  hectorFound: boolean;
};
type Attendance = {
  id: string;
  enteredAt: string;
  leftAt: string | null;
  employee: { name: string; lastName: string };
  customerWorksite: { worksite: { name: string } };
};
type InboxIssue = {
  id: string;
  phone: string;
  text: string;
  status: string;
  error: string | null;
  createdAt: string;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const subject = (r: Report) =>
  r.asset
    ? `${r.asset.sku.name} #${r.asset.internalNumber}`
    : (r.vehicle?.plate ??
      (r.customerWorksite
        ? `${r.customerWorksite.worksite.name} · ${r.customerWorksite.customer.name}`
        : "General"));
const deliveryLabels: Record<string, string> = {
  PENDING: "Pendiente",
  SENDING: "Enviando",
  SENT: "Enviada a Meta",
  DELIVERED: "Entregada",
  READ: "Leída",
  FAILED: "Falló",
  NO_PHONE: "Sin teléfono",
};

const inboxStatusLabels: Record<string, string> = {
  QUEUED: "Pendiente", PROCESSING: "En proceso", PROCESSED: "Procesado",
  FAILED: "Falló el procesamiento", REJECTED: "Requiere revisión",
};
const inboxErrorLabels: Record<string, string> = {
  UNKNOWN_OR_AMBIGUOUS_EMPLOYEE: "El número no corresponde a un único empleado activo. Revisa su registro.",
  MESSAGE_EXPIRED: "El mensaje venció. El empleado debe enviarlo nuevamente.",
  VALIDATION_REQUIRED: "Faltan datos por completar o corregir en el reporte.",
  PROCESSING_FAILED: "No se pudo procesar el reporte. Revisa el mensaje o vuelve a intentarlo.",
  ALERT_SEND_FAILED: "No se pudo enviar la alerta. Revisa el contacto e intenta nuevamente.",
};

export default function WhatsappReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [kind, setKind] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [issues, setIssues] = useState<InboxIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; title: string } | null>(
    null,
  );
  const [photoLoading, setPhotoLoading] = useState(false);
  const requestId = useRef(0);
  const photoRequestId = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams();
        if (kind) query.set("kind", kind);
        if (cursor) query.set("cursor", cursor);
        const result = await api<Report[]>(`/whatsapp-reports?${query}`);
        if (id !== requestId.current) return;
        setReports((previous) => (cursor ? [...previous, ...result] : result));
        setHasMore(result.length === 50);
      } catch (e) {
        if (id === requestId.current)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los reportes",
          );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [kind],
  );
  const loadStatus = useCallback(async () => {
    const results = await Promise.allSettled([
      api<Health>("/whatsapp-reports/health"),
      api<Attendance[]>("/whatsapp-reports/attendance"),
      api<InboxIssue[]>("/whatsapp-reports/inbox"),
    ]);
    if (results[0].status === "fulfilled") setHealth(results[0].value);
    if (results[1].status === "fulfilled") setAttendance(results[1].value);
    if (results[2].status === "fulfilled") setIssues(results[2].value);
    if (results.some((r) => r.status === "rejected"))
      setError(
        "No se pudo actualizar el estado del canal o la asistencia. Intenta actualizar.",
      );
  }, []);
  useEffect(() => {
    void load();
    return () => {
      requestId.current++;
    };
  }, [load]);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(
    () => () => {
      photoRequestId.current++;
    },
    [],
  );
  async function openPhoto(file: Report["evidence"][number]["fileObject"], number: number) {
    const id = ++photoRequestId.current;
    setPhotoLoading(true);
    setError("");
    try {
      const blob = await apiBlob(`/files/${file.id}/download`);
      if (id === photoRequestId.current)
        setPhoto({
          url: URL.createObjectURL(blob),
          title: `Foto de evidencia ${number}`,
        });
    } catch {
      if (id === photoRequestId.current)
        setError("No se pudo abrir la foto. Intenta de nuevo.");
    } finally {
      if (id === photoRequestId.current) setPhotoLoading(false);
    }
  }
  async function resolveReport() {
    if (!selected || !resolution.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/whatsapp-reports/${selected.id}/resolve`, {
        method: "PATCH",
        json: { resolution: resolution.trim() },
      });
      setSelected(null);
      setResolution("");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo resolver el reporte",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Container size="xl" py="lg">
      <Stack>
        <Group justify="space-between">
          <div>
            <Title order={2}>Reportes WhatsApp</Title>
            <Text c="dimmed">
              Daños, horómetros, peticiones y asistencia en obra.
            </Text>
          </div>
          <Button
            variant="light"
            onClick={() => {
              void load();
              void loadStatus();
            }}
            loading={loading}
          >
            Actualizar
          </Button>
        </Group>
        {error ? (
          <Alert color="red" title="No se pudo completar la acción">
            {error}
          </Alert>
        ) : null}
        {health &&
        (!health.enabled ||
          !health.aiConfigured ||
          !health.metaConfigured ||
          !health.actorConfigured ||
          !health.hectorFound) ? (
          <Alert color="yellow" title="Configuración del canal pendiente">
            <Text size="sm">
              {!health.enabled ? "El canal está desactivado. " : ""}
              {!health.aiConfigured ? "Falta la clave exclusiva de IA. " : ""}
              {!health.metaConfigured ? "Falta configuración de Meta. " : ""}
              {!health.actorConfigured
                ? "Falta el usuario de auditoría para empleados sin cuenta. "
                : ""}
              {!health.hectorFound
                ? "No se encontró a Héctor Ramírez entre los empleados activos; revisa su registro o configura su ID de destinatario. "
                : ""}
            </Text>
          </Alert>
        ) : null}
        <Tabs defaultValue="reports">
          <Tabs.List>
            <Tabs.Tab value="reports">Reportes</Tabs.Tab>
            <Tabs.Tab value="attendance">Asistencia</Tabs.Tab>
            <Tabs.Tab value="issues">
              Mensajes por revisar ({issues.length})
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="reports" pt="md">
            <Stack>
              <Select
                label="Tipo de reporte"
                placeholder="Todos los tipos"
                clearable
                value={kind}
                onChange={setKind}
                data={Object.entries(labels).map(([value, label]) => ({
                  value,
                  label,
                }))}
                maw={320}
              />
              {loading && !reports.length ? (
                <Loader aria-label="Cargando reportes" />
              ) : null}
              {!loading && !reports.length ? (
                <Paper withBorder p="xl">
                  <Text c="dimmed">
                    No hay reportes registrados para este filtro.
                  </Text>
                </Paper>
              ) : null}
              {reports.map((r) => (
                <Paper key={r.id} withBorder p="md" radius="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Group>
                        <Badge color={r.kind === "DAMAGE" ? "red" : "blue"}>
                          {labels[r.kind]}
                        </Badge>
                        <Text fw={600}>
                          {r.employee.name} {r.employee.lastName}
                        </Text>
                      </Group>
                      <Badge color={r.status === "RESOLVED" ? "green" : "gray"}>
                        {r.status === "RESOLVED" ? "Resuelto" : "Registrado"}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {subject(r)} · {date(r.occurredAt)} (Colombia)
                    </Text>
                    <Text style={{ whiteSpace: "pre-wrap" }}>
                      {r.description}
                    </Text>
                    {r.hours !== null ? (
                      <Text fw={600}>Horómetro: {r.hours} h</Text>
                    ) : null}
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        {r.location ? "Ubicación compartida" : r.evidence.length === 1 ? "1 foto" : `${r.evidence.length} fotos`}
                      </Text>
                      <Button
                        variant="light"
                        size="xs"
                        onClick={() => {
                          setSelected(r);
                          setResolution("");
                        }}
                      >
                        Ver reporte
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ))}
              {hasMore ? (
                <Button
                  variant="light"
                  loading={loading}
                  onClick={() => void load(reports.at(-1)?.id)}
                >
                  Cargar más
                </Button>
              ) : null}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="attendance" pt="md">
            <Text size="sm" c="dimmed" mb="md">
              Últimas 100 jornadas. Horas reportadas por WhatsApp en zona de
              Colombia; la ubicación o foto se consulta en los reportes de entrada y
              salida.
            </Text>
            <Table.ScrollContainer minWidth={640}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Empleado</Table.Th>
                    <Table.Th>Obra</Table.Th>
                    <Table.Th>Entrada</Table.Th>
                    <Table.Th>Salida</Table.Th>
                    <Table.Th>Duración</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {attendance.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td>
                        {a.employee.name} {a.employee.lastName}
                      </Table.Td>
                      <Table.Td>{a.customerWorksite.worksite.name}</Table.Td>
                      <Table.Td>{date(a.enteredAt)}</Table.Td>
                      <Table.Td>
                        {a.leftAt ? date(a.leftAt) : "Entrada abierta"}
                      </Table.Td>
                      <Table.Td>
                        {a.leftAt
                          ? `${((new Date(a.leftAt).getTime() - new Date(a.enteredAt).getTime()) / 3600000).toFixed(2)} h`
                          : "—"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!attendance.length ? (
              <Text c="dimmed">Aún no hay entradas o salidas registradas.</Text>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="issues" pt="md">
            <Stack>
              {issues.map((i) => (
                <Paper key={i.id} withBorder p="md">
                  <Group>
                    <Badge color="red">{inboxStatusLabels[i.status] ?? "Por revisar"}</Badge>
                    <Text>
                      {i.phone} · {date(i.createdAt)}
                    </Text>
                  </Group>
                  <Text mt="xs">{i.text || "Mensaje sin texto"}</Text>
                  <Text size="sm" c="dimmed">
                    {(i.error && inboxErrorLabels[i.error]) || "No se pudo completar la respuesta. Revisa el mensaje."}
                  </Text>
                </Paper>
              ))}
              {!issues.length ? (
                <Text c="dimmed">No hay mensajes pendientes de revisión.</Text>
              ) : null}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
      <Modal
        opened={Boolean(selected)}
        onClose={() => {
          if (!saving) setSelected(null);
        }}
        title="Detalle del reporte"
        size="lg"
      >
        {selected ? (
          <Stack>
            <Text fw={600}>
              {labels[selected.kind]} · {subject(selected)}
            </Text>
            <Text>
              {selected.employee.name} {selected.employee.lastName} ·{" "}
              {date(selected.occurredAt)}
            </Text>
            <Text style={{ whiteSpace: "pre-wrap" }}>
              {selected.description}
            </Text>
            {selected.location ? (
              <Stack gap="xs">
                <Text size="sm">Ubicación compartida: {selected.location.latitude.toFixed(6)}, {selected.location.longitude.toFixed(6)}</Text>
                <Text size="sm" c="dimmed">Recibida: {date(selected.location.receivedAt)} (Colombia)</Text>
                <Button component="a" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selected.location.latitude},${selected.location.longitude}`)}`} target="_blank" rel="noopener noreferrer" variant="light">Ver ubicación en el mapa</Button>
              </Stack>
            ) : null}
            <Group>
              {selected.evidence.map((e, index) => (
                <Button
                  key={e.fileObject.id}
                  variant="light"
                  loading={photoLoading}
                  onClick={() => void openPhoto(e.fileObject, index + 1)}
                >
                  Ver foto {index + 1}
                </Button>
              ))}
            </Group>
            {selected.alertRecipients.length ? (
              <Stack gap="xs">
                <Text fw={600}>Alertas a destinatarios</Text>
                {selected.alertRecipients.map((r) => (
                  <Group key={r.id} justify="space-between">
                    <Text size="sm">{r.name}</Text>
                    <Badge
                      color={
                        ["FAILED", "NO_PHONE"].includes(r.status)
                          ? "red"
                          : "blue"
                      }
                    >
                      {deliveryLabels[r.status] ?? "Por revisar"}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            ) : null}
            {selected.resolution ? (
              <Alert color="green" title="Resolución">
                {selected.resolution}
              </Alert>
            ) : null}
            {selected.status !== "RESOLVED" &&
            ["DAMAGE", "REQUEST"].includes(selected.kind) ? (
              <>
                <Textarea
                  label="Respuesta o resolución de oficina"
                  value={resolution}
                  onChange={(e) => setResolution(e.currentTarget.value)}
                  maxLength={2000}
                  minRows={3}
                />
                <Text size="xs" c="dimmed">
                  Resolver la alerta conserva el reporte. La reparación del
                  equipo se registra desde su ficha.
                </Text>
                <Button
                  onClick={() => void resolveReport()}
                  loading={saving}
                  disabled={!resolution.trim()}
                >
                  Marcar como resuelto
                </Button>
              </>
            ) : null}
          </Stack>
        ) : null}
      </Modal>
      <Modal
        opened={Boolean(photo)}
        onClose={() => {
          photoRequestId.current++;
          setPhoto(null);
        }}
        title={photo?.title}
        size="xl"
      >
        {photo ? (
          <Image
            src={photo.url}
            alt="Foto de evidencia del reporte"
            fit="contain"
            mah="75vh"
          />
        ) : null}
      </Modal>
    </Container>
  );
}
