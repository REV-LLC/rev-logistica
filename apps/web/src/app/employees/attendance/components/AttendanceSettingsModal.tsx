"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { api } from "@/lib/api";
import { type AttendanceSite, attendanceDate } from "@/lib/attendance";
import AttendancePrivatePhoto from "./AttendancePrivatePhoto";
import AttendanceSiteLocation from "./AttendanceSiteLocation";

type ReferenceEmployee = {
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

export default function AttendanceSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string | null>("references");
  const [employees, setEmployees] = useState<ReferenceEmployee[]>([]);
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<ReferenceEmployee | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [scan, setScan] = useState<Record<string, string>>({});
  const loadRefs = useCallback(
    async () =>
      setEmployees(
        await api<ReferenceEmployee[]>("/attendance/references", {
          cache: "no-store",
        }),
      ),
    [],
  );
  const loadSites = useCallback(
    async () =>
      setSites(
        await api<AttendanceSite[]>("/attendance/sites", { cache: "no-store" }),
      ),
    [],
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api<AttendanceSite[] | ReferenceEmployee[]>(
      tab === "sites" ? "/attendance/sites" : "/attendance/references",
      { cache: "no-store" },
    )
      .then((rows) => {
        if (active) {
          if (tab === "sites") setSites(rows as AttendanceSite[]);
          else setEmployees(rows as ReferenceEmployee[]);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab]);
  async function analyze(employee: ReferenceEmployee) {
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
    if (busy) return;
    setBusy("scan");
    setError("");
    for (const employee of employees) {
      try {
        await api(`/attendance/references/${employee.id}/analyze`, {
          method: "POST",
        });
        setScan((previous) => ({
          ...previous,
          [employee.id]: "Foto apta para revisar y aprobar",
        }));
      } catch (e) {
        setScan((previous) => ({
          ...previous,
          [employee.id]: (e as Error).message,
        }));
      }
    }
    setBusy("");
  }
  async function approve() {
    if (!selected || !candidate || busy) return;
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
  async function revoke() {
    if (!selected || busy) return;
    setBusy("revoke");
    setError("");
    try {
      await api(`/attendance/references/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      await loadRefs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Modal
        opened
        onClose={() => {
          if (!busy) onClose();
        }}
        title="Ajustes de asistencia"
        size="xl"
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          {error ? (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          ) : null}
          <Tabs value={tab} onChange={setTab}>
            <Tabs.List>
              <Tabs.Tab value="references" disabled={Boolean(busy)}>
                Fotos de referencia
              </Tabs.Tab>
              <Tabs.Tab value="sites" disabled={Boolean(busy)}>
                Ubicación de obras
              </Tabs.Tab>
            </Tabs.List>
            {loading ? (
              <Loader aria-label="Cargando ajustes de asistencia" />
            ) : null}
            <Tabs.Panel value="references" pt="md">
              <Stack>
                <Alert>
                  Se utilizan las fotos actuales de cada empleado. Revisa la
                  identidad antes de aprobar. Cambiar la foto del perfil no
                  cambia la referencia aprobada.
                </Alert>
                <Group>
                  <Button
                    loading={busy === "scan"}
                    disabled={loading || Boolean(busy && busy !== "scan")}
                    onClick={() => void scanAll()}
                  >
                    Comprobar fotos existentes
                  </Button>
                  <Button component={Link} href="/employees" variant="light">
                    Gestionar empleados y accesos
                  </Button>
                </Group>
                {!loading
                  ? employees.map((employee) => (
                      <Paper key={employee.id} withBorder p="md">
                        <Group justify="space-between">
                          <div>
                            <Text fw={600}>
                              {employee.name} {employee.lastName}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {employee.faceReference
                                ? `Referencia aprobada: ${attendanceDate(employee.faceReference.approvedAt)}`
                                : "Sin referencia aprobada"}
                            </Text>
                            <Text size="xs">
                              {employee.user?.active
                                ? `Acceso: ${employee.user.email}`
                                : "Necesita habilitar su cuenta desde Empleados"}
                            </Text>
                            {scan[employee.id] ? (
                              <Text size="sm">{scan[employee.id]}</Text>
                            ) : null}
                          </div>
                          <Button
                            variant="light"
                            disabled={Boolean(busy)}
                            onClick={() => void analyze(employee)}
                          >
                            Revisar foto
                          </Button>
                        </Group>
                      </Paper>
                    ))
                  : null}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="sites" pt="md">
              <Stack>
                <Alert>
                  Configura las coordenadas y el radio de cada obra. Hasta
                  configurarlos, sus marcaciones quedarán pendientes de
                  revisión.
                </Alert>
                {!loading
                  ? sites.map((site) => (
                      <AttendanceSiteLocation
                        key={`${site.id}-${site.worksite.attendanceLatitude}-${site.worksite.attendanceLongitude}-${site.worksite.attendanceRadiusMeters}`}
                        site={site}
                        onSaved={loadSites}
                      />
                    ))
                  : null}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(selected)}
        onClose={() => {
          if (!busy) {
            setSelected(null);
            setCandidate(null);
            setError("");
          }
        }}
        title={
          selected
            ? `${selected.name} ${selected.lastName}`
            : "Foto de referencia"
        }
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        {selected ? (
          <Stack>
            <AttendancePrivatePhoto
              path={`/employees/${selected.id}/photo`}
              alt="Foto actual del empleado"
            />
            <Text>
              Confirma que esta foto corresponde al empleado. Se usará para
              comparar sus próximas selfies.
            </Text>
            {error ? (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            ) : null}
            {candidate ? (
              <Button
                loading={busy === "approve"}
                disabled={Boolean(busy)}
                onClick={() => void approve()}
              >
                Confirmar identidad y aprobar foto
              </Button>
            ) : (
              <Text c="dimmed">
                {busy
                  ? "Comprobando calidad del rostro…"
                  : "La foto no está lista para aprobar. Corrígela desde Empleados."}
              </Text>
            )}
            {selected.faceReference ? (
              <Button
                color="red"
                variant="light"
                disabled={Boolean(busy)}
                onClick={() => void revoke()}
              >
                Retirar referencia aprobada
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
