"use client";

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { api } from '@/lib/api';
import type { ConfigurationEntry } from './types';

type Family = { id: string; name: string; controlType: 'SERIAL' | 'BULK'; subfamilies: Array<{ id: string; name: string; active: boolean }> };
type Warehouse = { id: string; name: string };

/** Uses native inventory creation. Never creates a second accessory stock ledger. */
export default function NewImplementForm({ initialFamilyId, initialOwnerWarehouseId, initialWarehouseId, onCreated, onBusyChange }: {
  initialFamilyId?: string;
  initialOwnerWarehouseId?: string | null;
  initialWarehouseId?: string | null;
  onCreated: (entry: ConfigurationEntry) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [control, setControl] = useState<'INDIVIDUAL' | 'RETURNABLE' | 'CONSUMABLE'>('INDIVIDUAL');
  const byQuantity = control !== 'INDIVIDUAL';
  const consumable = control === 'CONSUMABLE';
  const [name, setName] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [subfamilyId, setSubfamilyId] = useState<string | null>(null);
  const [newSubfamily, setNewSubfamily] = useState(false);
  const [subfamilyName, setSubfamilyName] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<Family[]>('/asset-families', { signal: controller.signal }), api<Warehouse[]>('/warehouses', { signal: controller.signal })])
      .then(([nextFamilies, nextWarehouses]) => { if (!controller.signal.aborted) {
        setFamilies(nextFamilies); setWarehouses(nextWarehouses);
        setFamilyId(nextFamilies.find(item => item.id === initialFamilyId && item.controlType === 'SERIAL')?.id ?? null);
        setOwnerWarehouseId(nextWarehouses.find(item => item.id === initialOwnerWarehouseId)?.id ?? null);
        setWarehouseId(nextWarehouses.find(item => item.id === initialWarehouseId)?.id ?? null);
      } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialFamilyId, initialOwnerWarehouseId, initialWarehouseId]);
  const family = families.find(item => item.id === familyId);
  const subfamilyReady = byQuantity || (newSubfamily ? !!subfamilyName.trim() : !!subfamilyId);
  async function create() {
    if (inFlight.current || !name.trim() || !ownerWarehouseId || !warehouseId || !familyId || !subfamilyReady) return;
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const base = { id: crypto.randomUUID(), role: 'ACCESSORY' as const, recommendation: false, required: false, defaultIncluded: false, quantity: 1 };
      if (byQuantity) {
        const result = await api<{ sku: { id: string } }>('/inventory/bulk-adjustments', {
          method: 'POST', json: { family: { id: familyId }, sku: { name: name.trim(), isImplement: true, isConsumable: consumable },
            ownerWarehouseId, warehouseId, quantity: Number(quantity) },
        });
        onCreated({ ...base, skuId: result.sku.id, sku: { id: result.sku.id, name: name.trim(), isConsumable: consumable } });
      } else {
        const result = await api<{ asset: { id: string; internalNumber: number } }>('/inventory/serialized-assets', {
          method: 'POST', json: { family: { id: familyId }, subfamily: newSubfamily ? { name: subfamilyName.trim() } : { id: subfamilyId }, sku: { name: name.trim() },
            asset: { description: name.trim(), isImplement: true }, ownerWarehouseId, warehouseCurrentId: warehouseId },
        });
        onCreated({ ...base, assetId: result.asset.id, asset: { id: result.asset.id, internalNumber: result.asset.internalNumber,
          publicCode: '', description: name.trim(), isImplement: true, sku: { name: name.trim() },
          warehouseOwner: { name: warehouses.find(item => item.id === ownerWarehouseId)?.name ?? '' } } });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el implemento.'); }
    finally { inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <Stack>
    {error ? <Alert color="red">{error}</Alert> : null}
    <TextInput label="Nombre" value={name} maxLength={160} required disabled={busy} onChange={event => setName(event.currentTarget.value)} />
    <Select label="Cómo se controla" value={control} allowDeselect={false} disabled={busy || loading}
      data={[{value:'INDIVIDUAL',label:'Unidad individual'}, {value:'RETURNABLE',label:'Por cantidad · Se devuelve'},
        {value:'CONSUMABLE',label:'Por cantidad · Se consume'}]}
      onChange={value => { if (!value) return; setControl(value as typeof control);
        const nextType = value === 'INDIVIDUAL' ? 'SERIAL' : 'BULK';
        setFamilyId(families.find(item => item.id === initialFamilyId && item.controlType === nextType)?.id ?? null);
        setSubfamilyId(null); setNewSubfamily(false); setSubfamilyName(''); setQuantity(1); }} />
    <Select label="Familia de inventario" value={familyId} required searchable disabled={busy || loading}
      data={families.filter(item => item.controlType === (byQuantity ? 'BULK' : 'SERIAL')).map(item => ({ value: item.id, label: item.name }))}
      onChange={value => { setFamilyId(value); setSubfamilyId(null); setNewSubfamily(false); setSubfamilyName(''); }} />
    {!byQuantity ? <Stack gap="xs">
      {newSubfamily ? <TextInput label="Nueva subfamilia" value={subfamilyName} required maxLength={120}
        disabled={busy || !family} onChange={event => setSubfamilyName(event.currentTarget.value)} />
        : <Select label="Subfamilia" value={subfamilyId} required searchable disabled={busy || !family}
          data={(family?.subfamilies ?? []).filter(item => item.active).map(item => ({ value: item.id, label: item.name }))} onChange={setSubfamilyId} />}
      <Button variant="subtle" size="xs" disabled={busy || !family} onClick={() => setNewSubfamily(!newSubfamily)}>
        {newSubfamily ? 'Elegir subfamilia existente' : 'Crear subfamilia'}
      </Button>
    </Stack> : null}
    <Select label="Bodega propietaria" value={ownerWarehouseId} searchable required disabled={busy || loading}
      data={warehouses.map(item => ({ value: item.id, label: item.name }))} onChange={setOwnerWarehouseId} />
    <Select label="Ubicación inicial" value={warehouseId} searchable required disabled={busy || loading}
      placeholder="Selecciona la bodega donde está el implemento"
      data={warehouses.map(item => ({ value: item.id, label: item.name }))} onChange={setWarehouseId} />
    {byQuantity ? <NumberInput label="Cantidad inicial" value={quantity} min={1} max={1000000} allowDecimal={false} disabled={busy} onChange={setQuantity} /> : null}
    <Button onClick={create} loading={busy} disabled={loading || !name.trim() || !familyId || !ownerWarehouseId || !warehouseId || !subfamilyReady || !Number.isInteger(Number(quantity)) || Number(quantity) < 1}>
      Crear implemento
    </Button>
  </Stack>;
}
