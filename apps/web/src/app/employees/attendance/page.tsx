"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AttendanceEmployeeCards from "./components/AttendanceEmployeeCards";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { api, apiBlob } from "@/lib/api";
import {
  AttendancePunch,
  AttendanceSite,
  attendanceDate,
  siteLabel,
  statusLabels,
  reasonLabels,
} from "@/lib/attendance";

type Employee = {
  id: string;
  name: string;
  lastName: string;
  user: { email: string; role: string; active: boolean } | null;
  faceReference: {
    photoHash: string;
    modelVersion: string;
    approvedAt: string;
  } | null;
};
type Candidate = { photoHash: string; modelVersion: string };
function PrivatePhoto({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setError(false);
    setUrl("");
    apiBlob(path, { cache: "no-store" })
      .then((blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt={alt}
      style={{ maxWidth: "100%", maxHeight: 340, borderRadius: 12 }}
    />
  ) : (
    <Text c="dimmed">{error ? "Foto no disponible" : "Cargando foto…"}</Text>
  );
}
function SiteLocation({
  site,
  saved,
}: {
  site: AttendanceSite;
  saved: () => Promise<void>;
}) {
  const [lat, setLat] = useState<string | number>(
    site.worksite.attendanceLatitude ?? "",
  );
  const [lon, setLon] = useState<string | number>(
    site.worksite.attendanceLongitude ?? "",
  );
  const [radius, setRadius] = useState<string | number>(
    site.worksite.attendanceRadiusMeters,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/attendance/sites/${site.id}`, {
        method: "PATCH",
        json: {
          latitude: Number(lat),
          longitude: Number(lon),
          radiusMeters: Number(radius),
        },
      });
      await saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Text fw={600}>{siteLabel(site)}</Text>
        <Group grow align="end">
          <NumberInput
            label="Latitud"
            value={lat}
            onChange={setLat}
            min={-90}
            max={90}
            decimalScale={7}
          />
          <NumberInput
            label="Longitud"
            value={lon}
            onChange={setLon}
            min={-180}
            max={180}
            decimalScale={7}
          />
          <NumberInput
            label="Radio (metros)"
            value={radius}
            onChange={setRadius}
            min={20}
            max={5000}
            allowDecimal={false}
          />
        </Group>
        <Text size="xs" c="dimmed">
          La ubicación se comparte entre los clientes vinculados a esta misma
          obra.
        </Text>
        {error ? <Text c="red">{error}</Text> : null}
        <Button
          variant="light"
          loading={busy}
          disabled={lat === "" || lon === "" || radius === ""}
          onClick={save}
        >
          Guardar ubicación
        </Button>
      </Stack>
    </Paper>
  );
}
export default function AttendanceAdmin() {
  const params = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>("shifts");
  useEffect(() => {
    if (params.get("employeeId")) setTab("shifts");
  }, [params]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scan, setScan] = useState<Record<string, string>>({});
  const [review, setReview] = useState<AttendancePunch | null>(null);
  const [note, setNote] = useState("");
  const [selfie, setSelfie] = useState<AttendancePunch | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loadPunches = useCallback(async () => {
    const items = await api<AttendancePunch[]>(
      `/attendance/punches${status ? `?status=${status}` : ""}`,
      { cache: "no-store" },
    );
    setPunches(items);
    setHasMore(items.length === 50);
  }, [status]);
  const loadRefs = useCallback(
    async () =>
      setEmployees(
        await api<Employee[]>("/attendance/references", { cache: "no-store" }),
      ),
    [],
  );
  const loadSites = useCallback(
    async () => setSites(await api<AttendanceSite[]>("/attendance/sites")),
    [],
  );
  useEffect(() => {
    const fn =
      tab === "punches"
        ? loadPunches
        : tab === "references"
          ? loadRefs
          : tab === "sites"
            ? loadSites
            : null;
    fn?.().catch((e) => setError(e.message));
  }, [tab, loadPunches, loadRefs, loadSites]);
  async function analyze(employee: Employee) {
    setError("");
    setCandidate(null);
    setSelected(employee);
    setBusy(employee.id);
    try {
      setCandidate(
        await api<Candidate>(`/attendance/references/${employee.id}/analyze`, {
          method: "POST",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function scanAll() {
    setBusy("scan");
    setError("");
    for (const employee of employees) {
      try {
        await api(`/attendance/references/${employee.id}/analyze`, {
          method: "POST",
        });
        setScan((prev) => ({
          ...prev,
          [employee.id]: "Foto apta para revisar y aprobar",
        }));
      } catch (e) {
        setScan((prev) => ({ ...prev, [employee.id]: (e as Error).message }));
      }
    }
    setBusy("");
  }
  async function approve() {
    if (!selected || !candidate) return;
    setBusy("approve");
    setError("");
    try {
      await api(`/attendance/references/${selected.id}/approve`, {
        method: "POST",
        json: { photoHash: candidate.photoHash },
      });
      setSelected(null);
      setCandidate(null);
      await loadRefs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function decide(decision: string) {
    if (!review) return;
    setBusy("review");
    setError("");
    try {
      await api(`/attendance/punches/${review.id}/review`, {
        method: "PATCH",
        json: { decision, note: note.trim() },
      });
      setReview(null);
      setNote("");
      await loadPunches();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function more() {
    setBusy("more");
    try {
      const query = new URLSearchParams({
        cursor: punches[punches.length - 1].id,
        ...(status ? { status } : {}),
      });
      const items = await api<AttendancePunch[]>(
        `/attendance/punches?${query}`,
      );
      setPunches((prev) => [...prev, ...items]);
      setHasMore(items.length === 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Container size="lg" py="md">
      <Stack>
        <div data-page-heading-glass>
          <Title order={1}>Asistencia y rostros</Title>
          <Text c="dimmed">
            Entradas y salidas de WhatsApp y PWA, revisión y fotos de
            referencia.
          </Text>
        </div>
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value);
            setError("");
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="shifts">Entradas y salidas</Tabs.Tab>
            <Tabs.Tab value="punches">Revisión de marcaciones</Tabs.Tab>
            <Tabs.Tab value="references">Fotos de referencia</Tabs.Tab>
            <Tabs.Tab value="sites">Ubicación de obras</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="punches" pt="md">
            <Stack>
              <Group>
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
                  mt="auto"
                  onClick={() =>
                    loadPunches().catch((e) => setError(e.message))
                  }
                >
                  Actualizar
                </Button>
              </Group>
              {!punches.length ? (
                <Text c="dimmed">No hay marcaciones para este filtro.</Text>
              ) : (
                punches.map((p) => (
                  <Paper key={p.id} withBorder p="md" radius="md">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={700}>
                          {p.employee.name} {p.employee.lastName} ·{" "}
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
                      <Text>{siteLabel(p.customerWorksite)}</Text>
                      <Text size="sm">
                        {attendanceDate(p.occurredAt)} · Precisión:{" "}
                        {Math.round(p.accuracyMeters)} m
                        {p.distanceMeters !== null
                          ? ` · Distancia: ${Math.round(p.distanceMeters)} m`
                          : ""}
                      </Text>
                      {p.reasons.length ? (
                        <Text size="sm" c="dimmed">
                          {p.reasons
                            .map((r) => reasonLabels[r] || r)
                            .join(" · ")}
                        </Text>
                      ) : null}
                      {p.reviewNote ? (
                        <Text size="sm">Revisión: {p.reviewNote}</Text>
                      ) : null}
                      <Group>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => setSelfie(p)}
                        >
                          Ver selfie
                        </Button>
                        <Button
                          size="xs"
                          component="a"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                          variant="subtle"
                        >
                          Ver ubicación
                        </Button>
                        {p.status === "PENDING" ? (
                          <Button
                            size="xs"
                            onClick={() => {
                              setReview(p);
                              setNote("");
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
              {hasMore ? (
                <Button
                  loading={busy === "more"}
                  variant="light"
                  onClick={more}
                >
                  Cargar más
                </Button>
              ) : null}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="shifts" pt="md">
            {tab === "shifts" ? (
              <AttendanceEmployeeCards
                key={`${params.get("employeeId") ?? ""}:${params.get("date") ?? ""}`}
                initialEmployeeId={params.get("employeeId")}
                initialDate={params.get("date")}
              />
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="references" pt="md">
            <Stack>
              <Alert>
                Se utilizan las fotos actuales de cada empleado. Revisa la
                identidad antes de aprobar. Cambiar la foto del perfil no cambia
                la referencia aprobada.
              </Alert>
              <Group>
                <Button
                  loading={busy === "scan"}
                  disabled={!!busy && busy !== "scan"}
                  onClick={scanAll}
                >
                  Comprobar fotos existentes
                </Button>
                <Button component={Link} href="/employees" variant="light">
                  Gestionar empleados y accesos
                </Button>
              </Group>
              {employees.map((e) => (
                <Paper key={e.id} withBorder p="md">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>
                        {e.name} {e.lastName}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {e.faceReference
                          ? `Referencia aprobada: ${attendanceDate(e.faceReference.approvedAt)}`
                          : "Sin referencia aprobada"}
                      </Text>
                      <Text size="xs">
                        {e.user?.active
                          ? `Acceso: ${e.user.email}`
                          : "Necesita habilitar su cuenta desde Empleados"}
                      </Text>
                      {scan[e.id] ? <Text size="sm">{scan[e.id]}</Text> : null}
                    </div>
                    <Button
                      variant="light"
                      disabled={!!busy}
                      onClick={() => analyze(e)}
                    >
                      Revisar foto
                    </Button>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="sites" pt="md">
            <Stack>
              <Alert>
                Configura las coordenadas y el radio de cada obra. Hasta
                configurarlos, sus marcaciones quedarán pendientes de revisión.
              </Alert>
              {sites.map((s) => (
                <SiteLocation
                  key={`${s.id}-${s.worksite.attendanceLatitude}-${s.worksite.attendanceLongitude}-${s.worksite.attendanceRadiusMeters}`}
                  site={s}
                  saved={loadSites}
                />
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>
        <Modal
          opened={!!selected}
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setCandidate(null);
            }
          }}
          title={
            selected
              ? `${selected.name} ${selected.lastName}`
              : "Foto de referencia"
          }
        >
          <Stack>
            {selected ? (
              <PrivatePhoto
                path={`/employees/${selected.id}/photo`}
                alt="Foto actual del empleado"
              />
            ) : null}
            <Text>
              Confirma que esta foto corresponde al empleado. Se usará para
              comparar sus próximas selfies.
            </Text>
            {error ? <Alert color="red">{error}</Alert> : null}
            {candidate ? (
              <Button loading={busy === "approve"} onClick={approve}>
                Confirmar identidad y aprobar foto
              </Button>
            ) : (
              <Text c="dimmed">
                {busy
                  ? "Comprobando calidad del rostro…"
                  : "La foto no está lista para aprobar. Corrígela desde Empleados."}
              </Text>
            )}
            {selected?.faceReference ? (
              <Button
                color="red"
                variant="light"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("revoke");
                  try {
                    await api(`/attendance/references/${selected.id}`, {
                      method: "DELETE",
                    });
                    setSelected(null);
                    await loadRefs();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Retirar referencia aprobada
              </Button>
            ) : null}
          </Stack>
        </Modal>
        <Modal
          opened={!!review}
          onClose={() => {
            if (!busy) setReview(null);
          }}
          title="Revisar marcación"
        >
          <Stack>
            <Text>
              La decisión conserva la jornada y la evidencia originales.
              Rechazar no borra la entrada ni la salida.
            </Text>
            {review ? (
              <PrivatePhoto
                path={`/attendance/punches/${review.id}/selfie`}
                alt="Selfie de la marcación"
              />
            ) : null}
            <Textarea
              label="Motivo de la decisión"
              minRows={3}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              maxLength={1000}
            />
            {error ? <Alert color="red">{error}</Alert> : null}
            <Group>
              <Button
                loading={busy === "review"}
                disabled={note.trim().length < 5}
                onClick={() => decide("APPROVED")}
              >
                Aprobar
              </Button>
              <Button
                color="red"
                loading={busy === "review"}
                disabled={note.trim().length < 5}
                onClick={() => decide("REJECTED")}
              >
                Rechazar
              </Button>
            </Group>
          </Stack>
        </Modal>
        <Modal
          opened={!!selfie}
          onClose={() => setSelfie(null)}
          title="Selfie de la marcación"
        >
          {selfie ? (
            <PrivatePhoto
              path={`/attendance/punches/${selfie.id}/selfie`}
              alt="Selfie de la marcación"
            />
          ) : null}
        </Modal>
      </Stack>
    </Container>
  );
}
