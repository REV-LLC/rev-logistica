"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconCamera, IconClock, IconMapPin } from "@tabler/icons-react";
import AuthGuard from "@/components/AuthGuard";
import ResponsiveShell from "@/components/ResponsiveShell";
import { api, ApiError } from "@/lib/api";
import {
  AttendancePunch,
  AttendanceShift,
  AttendanceSite,
  attendanceDate,
  siteLabel,
  statusLabels,
} from "@/lib/attendance";

type Me = {
  employee: { id: string; name: string };
  referenceReady: boolean;
  open: AttendanceShift | null;
  recent: AttendancePunch[];
  worksites: AttendanceSite[];
};
export default function AttendancePage() {
  return (
    <AuthGuard
      allowedRoles={["ADMIN", "OFFICE", "DRIVER", "OPERATOR", "EMPLOYEE"]}
    >
      <ResponsiveShell>
        <Attendance />
      </ResponsiveShell>
    </AuthGuard>
  );
}
function Attendance() {
  const [data, setData] = useState<Me | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pending = useRef<FormData | null>(null);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    const next = await api<Me>("/attendance/me", { cache: "no-store" });
    setData(next);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 960 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current
            .play()
            .catch(() => setError("No se pudo iniciar la cámara"));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Permite usar la cámara frontal para tomar tu selfie.");
          setCamera(false);
        }
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [camera, stopCamera]);
  function begin() {
    setError("");
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Abre la aplicación con HTTPS en un navegador con cámara.");
      return;
    }
    setPhoto(null);
    pending.current = null;
    setCamera(true);
  }
  async function capture() {
    const v = video.current;
    if (!v?.videoWidth) {
      setError("Espera a que la cámara esté lista");
      return;
    }
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * ratio);
    canvas.height = Math.round(v.videoHeight * ratio);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (blob) {
      setPhoto(blob);
      setCamera(false);
    }
  }
  async function submit() {
    if (!photo || !data || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "No hay conexión. Tu marcación todavía no se ha completado.",
        );
      if (!pending.current) {
        if (!navigator.geolocation)
          throw new Error("Tu navegador no permite obtener la ubicación");
        const location = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              resolve,
              () =>
                reject(
                  new Error(
                    "Activa la ubicación precisa y permite el acceso para registrar.",
                  ),
                ),
              { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
            ),
        );
        const form = new FormData();
        form.append("requestId", crypto.randomUUID());
        form.append("kind", data.open ? "CHECK_OUT" : "CHECK_IN");
        if (data.open) form.append("attendanceId", data.open.id);
        else if (site) form.append("customerWorksiteId", site);
        form.append("latitude", String(location.coords.latitude));
        form.append("longitude", String(location.coords.longitude));
        form.append("accuracyMeters", String(location.coords.accuracy));
        form.append(
          "locationCapturedAt",
          new Date(location.timestamp).toISOString(),
        );
        form.append("selfie", photo, "selfie.jpg");
        pending.current = form;
      }
      const result = await api<AttendancePunch>("/attendance/punches", {
        method: "POST",
        body: pending.current,
      });
      setMessage(
        `${result.kind === "CHECK_IN" ? "Entrada" : "Salida"} registrada · ${attendanceDate(result.occurredAt)}. ${statusLabels[result.status]}.`,
      );
      pending.current = null;
      setPhoto(null);
      setSite(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
      // Retain the same request on uncertain network failures: retries cannot duplicate a shift.
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        if (e.status === 409) await load().catch(() => undefined);
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <Container size={620} py="lg">
      <Stack gap="lg">
        <div data-page-heading-glass>
          <Text size="sm" c="dimmed">
            REV · Registro en obra
          </Text>
          <Title order={1}>Mi asistencia</Title>
          <Text>{data?.employee.name}</Text>
        </div>
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
        {!data ? (
          <>
            {!error ? <Loader aria-label="Cargando asistencia" /> : null}
            <Button
              variant="light"
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
            >
              Actualizar
            </Button>
          </>
        ) : (
          <>
            {!data.referenceReady ? (
              <Alert color="yellow">
                Oficina todavía debe aprobar tu foto de referencia. Puedes
                marcar y el registro quedará pendiente de revisión.
              </Alert>
            ) : null}
            <Paper p="lg" radius="lg" withBorder>
              <Stack>
                <Group>
                  <IconClock size={24} />
                  <Badge color={data.open ? "green" : "gray"} size="lg">
                    {data.open ? "En obra" : "Sin entrada abierta"}
                  </Badge>
                </Group>
                {data.open ? (
                  <div>
                    <Text fw={600}>
                      {siteLabel(data.open.customerWorksite)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Entrada: {attendanceDate(data.open.enteredAt)}
                    </Text>
                  </div>
                ) : (
                  <Select
                    label="Obra"
                    placeholder="Selecciona la obra donde estás"
                    searchable
                    value={site}
                    onChange={(value) => {
                      setSite(value);
                      pending.current = null;
                    }}
                    disabled={busy || !!photo || camera}
                    data={data.worksites.map((s) => ({
                      value: s.id,
                      label: siteLabel(s),
                    }))}
                  />
                )}
                <Text size="sm" c="dimmed">
                  <IconMapPin size={16} style={{ verticalAlign: "middle" }} />{" "}
                  Se guardará tu selfie, ubicación y hora del servidor.
                </Text>
                {!camera && !photo ? (
                  <Button
                    size="xl"
                    leftSection={<IconCamera />}
                    disabled={!data.open && !site}
                    onClick={begin}
                  >
                    {data.open ? "Registrar salida" : "Registrar entrada"}
                  </Button>
                ) : null}
                {camera ? (
                  <>
                    <video
                      ref={video}
                      playsInline
                      muted
                      aria-label="Cámara frontal"
                      style={{
                        width: "100%",
                        maxHeight: 420,
                        borderRadius: 16,
                        background: "#071d33",
                        transform: "scaleX(-1)",
                      }}
                    />
                    <Text size="sm">
                      Mira de frente y busca buena luz. Toma la foto en un lugar
                      seguro.
                    </Text>
                    <Button size="lg" onClick={capture}>
                      Tomar selfie
                    </Button>
                    <Button variant="subtle" onClick={() => setCamera(false)}>
                      Cancelar
                    </Button>
                  </>
                ) : null}
                {preview ? (
                  <>
                    <img
                      src={preview}
                      alt="Tu selfie para esta marcación"
                      style={{
                        width: "100%",
                        maxHeight: 380,
                        objectFit: "contain",
                        borderRadius: 16,
                      }}
                    />
                    <Button size="xl" loading={busy} onClick={submit}>
                      Confirmar {data.open ? "salida" : "entrada"}
                    </Button>
                    <Button
                      variant="light"
                      disabled={busy || !!pending.current}
                      onClick={begin}
                    >
                      Tomar otra foto
                    </Button>
                    {pending.current ? (
                      <Text size="xs" c="dimmed">
                        Si hubo un corte de conexión, confirma otra vez para
                        consultar o completar la misma marcación.
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </Stack>
            </Paper>
            <Title order={2} size="h3">
              Últimas marcaciones
            </Title>
            {!data.recent.length ? (
              <Text c="dimmed">
                Todavía no tienes marcaciones desde la PWA.
              </Text>
            ) : (
              data.recent.map((p) => (
                <Paper key={p.id} withBorder p="md" radius="md">
                  <Group justify="space-between">
                    <Text fw={600}>
                      {p.kind === "CHECK_IN" ? "Entrada" : "Salida"}
                    </Text>
                    <Badge
                      color={
                        p.status === "PENDING"
                          ? "yellow"
                          : p.status === "REJECTED"
                            ? "red"
                            : "green"
                      }
                    >
                      {statusLabels[p.status]}
                    </Badge>
                  </Group>
                  <Text size="sm">{siteLabel(p.customerWorksite)}</Text>
                  <Text size="sm" c="dimmed">
                    {attendanceDate(p.occurredAt)}
                  </Text>
                  {p.reviewNote ? (
                    <Text size="sm">Oficina: {p.reviewNote}</Text>
                  ) : null}
                </Paper>
              ))
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
