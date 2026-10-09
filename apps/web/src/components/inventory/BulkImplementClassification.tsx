'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Group, Select, Stack } from '@mantine/core';
import { api } from '@/lib/api';

type Kind = 'MATERIAL' | 'RETURNABLE' | 'CONSUMABLE';
export default function BulkImplementClassification({ skuId }: { skuId: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [saved, setSaved] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setKind(null); setSaved(null); setError(null);
    api<{ isImplement: boolean; isConsumable: boolean }>(`/skus/${skuId}`, { signal: controller.signal }).then(item => {
      if (controller.signal.aborted) return;
      const value = item.isImplement ? item.isConsumable ? 'CONSUMABLE' : 'RETURNABLE' : 'MATERIAL';
      setKind(value); setSaved(value);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la clasificación.'); });
    return () => controller.abort();
  }, [skuId]);
  async function save() {
    if (!kind || busy) return;
    setBusy(true); setError(null);
    try {
      await api(`/skus/${skuId}`, { method: 'PATCH', json: { isImplement: kind !== 'MATERIAL', isConsumable: kind === 'CONSUMABLE' } });
      setSaved(kind);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la clasificación.'); }
    finally { setBusy(false); }
  }
  return <Stack gap="xs">
    <Group align="end">
      <Select label="Clasificación" value={kind} onChange={value => setKind(value as Kind)}
        disabled={!saved || busy} allowDeselect={false} style={{ flex: 1 }} data={[
          { value: 'MATERIAL', label: 'Material' }, { value: 'RETURNABLE', label: 'Implemento retornable' },
          { value: 'CONSUMABLE', label: 'Implemento consumible' },
        ]} />
      <Button onClick={save} loading={busy} disabled={!kind || kind === saved}>Guardar</Button>
    </Group>
    {error ? <Alert color="red">{error}</Alert> : null}
  </Stack>;
}
