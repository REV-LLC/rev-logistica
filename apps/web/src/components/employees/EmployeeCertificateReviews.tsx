"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { api, apiBlob } from "@/lib/api";
type Provider = { id: string; kind: string; name: string; active: boolean };
type Review = {
  id: string;
  kind: "EPS" | "ARL";
  status: string;
  message: string | null;
  candidateProviderId: string | null;
  candidateProvider: { name: string } | null;
  employee: {
    id: string;
    name: string;
    lastName: string;
    epsId: string | null;
    arlId: string | null;
    eps: string | null;
    arl: string | null;
  };
  employeeDocument: {
    fileObject: {
      id: string;
      displayName: string | null;
      originalName: string | null;
      mimeType: string | null;
    };
  } | null;
};
const labels: Record<string, string> = {
  PENDING: "En espera",
  PROCESSING: "Revisando certificado",
  REVIEW: "Revisión de oficina",
  APPLIED: "Entidad asignada",
  DISMISSED: "Sin asignación",
};
export default function EmployeeCertificateReviews({
  providers,
  onChanged,
}: {
  providers: Provider[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Review[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<Review | null>(null),
    [providerId, setProviderId] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      url: string;
      type: string;
      name: string;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<Review[]>("/employee-affiliations/certificates", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRows(data);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("No pudimos cargar la revisión de certificados.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const processing = rows.some((row) =>
    ["PENDING", "PROCESSING"].includes(row.status),
  );
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => setRefresh((x) => x + 1), 5000);
    return () => clearInterval(timer);
  }, [processing]);
  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);
  async function open(row: Review) {
    const file = row.employeeDocument?.fileObject;
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await apiBlob(`/files/${file.id}/download`, {
        cache: "no-store",
      });
      const url = URL.createObjectURL(blob),
        name = file.displayName || file.originalName || "Certificado";
      if (blob.type === "application/pdf" || blob.type.startsWith("image/"))
        setPreview({ url, type: blob.type, name });
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch {
      setError("No pudimos abrir el certificado.");
    } finally {
      setBusy(false);
    }
  }
  async function save(action: "ASSIGN" | "DISMISS") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/employee-affiliations/certificates/${selected.id}/review`, {
        method: "POST",
        json: {
          action,
          providerId,
          confirmed,
          expectedCurrentId:
            selected.kind === "EPS"
              ? selected.employee.epsId
              : selected.employee.arlId,
        },
      });
      setSelected(null);
      setRefresh((x) => x + 1);
      onChanged();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No pudimos guardar la revisión.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Certificados EPS y ARL</Title>
        <Button
          variant="light"
          onClick={() => setRefresh((x) => x + 1)}
          disabled={loading || busy}
        >
          Actualizar
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Al subir un certificado en Documentos del empleado, revisamos la entidad
        y su afiliación. Los casos que necesitan confirmación aparecen aquí.
      </Text>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Text role="status">Cargando certificados…</Text>
      ) : !rows.length ? (
        <Text c="dimmed">
          Todavía no hay certificados EPS o ARL para revisar.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Paper key={row.id} withBorder p="md" radius="md" style={{minWidth:0}}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} style={{overflowWrap:'anywhere',minWidth:0}}>
                {row.employee.name} {row.employee.lastName}
              </Text>
              <Badge
                color={
                  row.status === "APPLIED"
                    ? "teal"
                    : row.status === "REVIEW"
                      ? "yellow"
                      : "gray"
                }
              >
                {labels[row.status] || row.status}
              </Badge>
            </Group>
            <Text size="sm" style={{overflowWrap:'anywhere'}}>
              {row.kind} ·{" "}
              {row.employeeDocument?.fileObject.displayName ||
                row.employeeDocument?.fileObject.originalName ||
                "Documento no disponible"}
            </Text>
            {row.candidateProvider ? (
              <Text size="sm" style={{overflowWrap:'anywhere'}}>
                Entidad identificada: {row.candidateProvider.name}
              </Text>
            ) : null}
            {row.status === "REVIEW" && row.message ? (
              <Text size="sm" style={{overflowWrap:'anywhere'}}>{row.message}</Text>
            ) : null}
            <Group gap="xs">
              {row.employeeDocument ? (
                <Button
                  size="xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => void open(row)}
                >
                  {row.employeeDocument.fileObject.mimeType ===
                    "application/pdf" ||
                  row.employeeDocument.fileObject.mimeType?.startsWith("image/")
                    ? "Ver certificado"
                    : "Descargar certificado"}
                </Button>
              ) : null}
              {row.status === "REVIEW" ? (
                <Button
                  size="xs"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setSelected(row);
                    setProviderId(
                      providers.some(
                        (p) => p.id === row.candidateProviderId && p.active,
                      )
                        ? row.candidateProviderId
                        : null,
                    );
                    setConfirmed(false);
                  }}
                >
                  Revisar asignación
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Paper>
      ))}
      <Modal
        opened={Boolean(selected)}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Revisar afiliación"
        centered
      >
        <Stack gap="md">
          {error ? (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          ) : null}
          <Text>
            {selected?.employee.name} {selected?.employee.lastName} ·{" "}
            {selected?.kind}
          </Text>
          <Text size="sm" style={{overflowWrap:'anywhere'}}>
            Asignación actual:{" "}
            {selected
              ? (selected.kind === "EPS"
                  ? selected.employee.eps
                  : selected.employee.arl) || "Sin asignar"
              : ""}
          </Text>
          <Select
            label="Entidad confirmada"
            placeholder="Selecciona una entidad"
            searchable
            value={providerId}
            onChange={setProviderId}
            data={providers
              .filter((p) => p.active && p.kind === selected?.kind)
              .map((p) => ({ value: p.id, label: p.name }))}
            disabled={busy || !selected?.employeeDocument}
          />
          <Checkbox
            label="Revisé el certificado y confirmé que corresponde a este empleado y esta entidad."
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            disabled={busy}
          />
          <Button
            onClick={() => void save("ASSIGN")}
            loading={busy}
            disabled={!providerId || !confirmed || !selected?.employeeDocument}
          >
            Confirmar asignación
          </Button>
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() => void save("DISMISS")}
          >
            Cerrar sin cambiar afiliación
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name || "Certificado"}
        size="xl"
        centered
      >
        {preview?.type === "application/pdf" ? (
          <iframe
            src={preview.url}
            title="Certificado"
            style={{ width: "100%", height: "70dvh", border: 0 }}
          />
        ) : preview ? (
          <img
            src={preview.url}
            alt="Certificado"
            style={{
              maxWidth: "100%",
              maxHeight: "70dvh",
              display: "block",
              margin: "auto",
            }}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}
