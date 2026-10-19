'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, NumberInput, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconMapPinPlus } from '@tabler/icons-react';
import { api } from '@/lib/api';

type Place = { id: number; name: string; radiusMeters: number };
type Device = { id: number; name: string; positionId: number | null; reportedAt: string | null; recent: boolean; knownPlaces: Pick<Place, 'id' | 'name'>[] };
type State = { places: Place[]; devices: Device[] };
type Draft = { device: Device; requestId: string; name: string; radius: number | string };
const reportTime = (value: string | null) => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'Sin ubicación recibida';

export default function KnownPlaces({ onSaved }: { onSaved: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const result = await api<State>('/tracking/places', { signal: controller.signal, cache: 'no-store' });
        if (active) { setState(result); setLoadError(false); }
      } catch { if (active) setLoadError(true); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [attempt]);

  const device = state?.devices.find((item) => String(item.id) === selected);
  const recent = Boolean(device?.recent && device.reportedAt && Date.now() - Date.parse(device.reportedAt) <= 15 * 60_000);
  const save = async () => {
    if (!draft || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const place = await api<Place>('/tracking/places', { method: 'POST', json: {
        name: draft.name.trim(), deviceId: draft.device.id, positionId: draft.device.positionId,
        radiusMeters: draft.radius, requestId: draft.requestId,
      } });
      setSuccess(`Punto «${place.name}» guardado para toda la flota.`);
      setDraft(null);
      setAttempt((value) => value + 1);
      onSaved();
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'No fue posible guardar el punto.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <>
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end">
          <Select label="Puntos conocidos · Camión" placeholder={state ? 'Selecciona un camión' : 'Cargando camiones…'}
            searchable value={selected} onChange={(value) => { setSelected(value); setSuccess(null); }}
            data={(state?.devices || []).map((item) => ({ value: String(item.id), label: item.name }))}
            style={{ flex: '1 1 220px', maxWidth: 360 }} />
          <Button color="teal" leftSection={<IconMapPinPlus size={18} />} disabled={!device || !recent || loadError}
            onClick={() => { if (device) { setDraft({ device, requestId: crypto.randomUUID(), name: '', radius: 50 }); setSaveError(null); setSuccess(null); } }}>
            + Guardar ubicación
          </Button>
        </Group>
        {device ? <Stack gap={4}>
          <Group gap="xs">
            <Text size="sm">Último reporte de {device.name}:</Text>
            {!loadError && recent ? <Badge color={device.knownPlaces.length ? 'teal' : 'gray'} variant="light">
              {device.knownPlaces.length ? device.knownPlaces.map((place) => place.name).join(' · ') : 'Fuera de puntos conocidos'}
            </Badge> : <Badge color="orange" variant="light">{loadError ? 'No se pudo actualizar' : 'Sin reporte reciente'}</Badge>}
          </Group>
          <Text size="xs" c="dimmed">{reportTime(device.reportedAt)}{!recent && device.knownPlaces.length ? ` · Coincidía con ${device.knownPlaces.map((place) => place.name).join(', ')}` : ''}</Text>
          {!recent ? <Text size="xs" c="dimmed">Para guardar, el camión necesita una ubicación válida de los últimos 15 minutos.</Text> : null}
        </Stack> : <Text size="sm" c="dimmed">Selecciona el camión que está en el lugar y guarda su última ubicación con un nombre, por ejemplo «Vereal SA».</Text>}
        {loadError ? <Alert color="orange" title="No fue posible consultar los puntos">
          <Button size="xs" variant="light" onClick={() => setAttempt((value) => value + 1)}>Actualizar puntos</Button>
        </Alert> : null}
        {success ? <Alert color="teal" role="status">{success}</Alert> : null}
        {state?.places.length ? <Group gap="xs" aria-label="Puntos guardados">
          {state.places.map((place) => <Badge key={place.id} color="teal" variant="outline" style={{ maxWidth: '100%' }}>{place.name} · {place.radiusMeters} m</Badge>)}
        </Group> : null}
      </Stack>
    </Paper>
    <Modal opened={draft !== null} onClose={() => { if (!savingRef.current) setDraft(null); }} title="Guardar punto conocido"
      centered closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
      {draft ? <Stack gap="md">
        <Text size="sm">Se usará la ubicación reportada por <strong>{draft.device.name}</strong> el {reportTime(draft.device.reportedAt)}. Confirma que corresponde al lugar que quieres guardar.</Text>
        <TextInput label="Nombre del lugar" placeholder="Vereal SA" maxLength={100} value={draft.name} disabled={saving}
          onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} autoFocus />
        <NumberInput label="Radio del punto (metros)" description="Todos los camiones se reconocerán dentro de esta zona."
          min={25} max={2000} allowDecimal={false} value={draft.radius} disabled={saving} onChange={(radius) => setDraft({ ...draft, radius })} />
        {saveError ? <Alert color="red" role="alert">{saveError}<Text size="xs" mt="xs">Si cambió la ubicación, cierra el formulario, selecciona el camión y vuelve a guardar.</Text></Alert> : null}
        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={() => setDraft(null)}>Cancelar</Button>
          <Button color="teal" loading={saving} disabled={!draft.name.trim() || typeof draft.radius !== 'number' || draft.radius < 25 || draft.radius > 2000}
            onClick={() => void save()}>Guardar punto</Button>
        </Group>
      </Stack> : null}
    </Modal>
  </>;
}
