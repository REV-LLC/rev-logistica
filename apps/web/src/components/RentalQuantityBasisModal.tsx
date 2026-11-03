'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Text } from '@mantine/core';
import { api } from '@/lib/api';

export type RentalQuantityReference = {
  id: string;
  name: string;
  rentalQuantityBasis?: 'UNIT' | 'AREA_M2';
  areaM2?: number | string | null;
};

export default function RentalQuantityBasisModal({ reference, onClose, onSaved }: {
  reference: RentalQuantityReference;
  onClose: () => void;
  onSaved: (updated: RentalQuantityReference) => void;
}) {
  const [basis, setBasis] = useState<'UNIT' | 'AREA_M2'>(reference.rentalQuantityBasis ?? 'UNIT');
  const [area, setArea] = useState<number | string>(reference.areaM2 == null ? '' : Number(reference.areaM2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validArea = Number.isFinite(Number(area)) && Number(area) > 0;
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const updated = await api<RentalQuantityReference>(`/skus/${reference.id}`, {
        method: 'PATCH', json: { rentalQuantityBasis: basis,
          ...(basis === 'AREA_M2' ? { areaM2: Number(area) } : {}) },
      });
      onSaved(updated);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.'); }
    finally { setBusy(false); }
  };
  return <Modal opened onClose={() => { if (!busy) onClose(); }} title="Base del cobro diario" centered>
    <Stack>
      <Text fw={600}>{reference.name}</Text>
      <Select label="Calcular el alquiler por" value={basis} disabled={busy} allowDeselect={false}
        data={[{ value: 'UNIT', label: 'Unidad × día' }, { value: 'AREA_M2', label: 'm² × día' }]}
        onChange={value => { if (value === 'UNIT' || value === 'AREA_M2') setBasis(value); }} />
      {basis === 'AREA_M2' && <NumberInput label="Área por pieza (m²)" description="Ancho × alto en metros. Para piezas con varias caras, utiliza el área total acordada."
        value={area} onChange={setArea} min={0} max={9999999999} decimalScale={6} allowNegative={false} disabled={busy} />}
      <Text size="sm">{basis === 'AREA_M2' ? 'Total = piezas × m² por pieza × días × tarifa por m²/día.' : 'Total = piezas × días × tarifa por unidad/día.'}</Text>
      <Text size="sm" c="dimmed">La tarifa de la lista de precios se interpreta con esta base. Los anexos guardados conservan su cálculo hasta que se actualicen sus fuentes.</Text>
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button loading={busy} disabled={basis === 'AREA_M2' && !validArea} onClick={save}>Guardar configuración</Button></Group>
    </Stack>
  </Modal>;
}
