'use client';

import { Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';

export const MAINTENANCE_WORK_OPTIONS = [
  'Cambio de filtro de aire',
  'Cambio de filtro de aceite',
  'Cambio de filtro de combustible',
  'Cambio de aceite hidráulico',
  'Cambio de aceite de motor',
  'Cambio de pastillas',
  'Cambio de discos de freno',
  'Cambio de frenos',
  'Alineación y balanceo',
  'Cambio de batería',
  'Cambio de llantas',
  'Cambio de zapatos',
  'Cambio de correas',
  'Otro',
];

export function workKind(name: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return MAINTENANCE_WORK_OPTIONS.find((option) => normalize(option) === normalize(name)) ?? 'Otro';
}

export function workLabel(name: string) {
  const kind = workKind(name);
  if (kind !== 'Otro') return kind;
  const label = name.trim();
  if (!label) return 'Otro';
  return label.charAt(0).toLocaleUpperCase('es') + label.slice(1).toLocaleLowerCase('es');
}

export type WorkDetails = {
  kind: string | null;
  name: string;
  reference: string;
  viscosityWinter: number | '';
  viscosityHot: number | '';
};

export function workReference(work: WorkDetails) {
  if (work.kind === 'Cambio de aceite de motor') {
    if (work.viscosityWinter === '' || work.viscosityHot === '') return '';
    return `${work.viscosityWinter}W-${work.viscosityHot}`;
  }
  return work.reference.trim();
}

export default function MaintenanceWorkFields({ value, index, existing, onChange }: {
  value: WorkDetails;
  index: number;
  existing: boolean;
  onChange: (update: Partial<WorkDetails>) => void;
}) {
  const suffix = ` · trabajo ${index + 1}`;
  return (
    <Stack gap="sm">
      {!existing ? <Select
        label={`Trabajo realizado ${index + 1}`}
        placeholder="Selecciona el trabajo realizado"
        data={MAINTENANCE_WORK_OPTIONS}
        value={value.kind}
        searchable
        required
        onChange={(kind) => onChange({ kind, name: kind === 'Otro' ? '' : kind ?? '', reference: '', viscosityWinter: '', viscosityHot: '' })}
      /> : null}
      {!existing && value.kind === 'Otro' ? <TextInput label={`Describe el trabajo${suffix}`} placeholder="Escribe el mantenimiento realizado" value={value.name} onChange={(event) => onChange({ name: event.currentTarget.value })} required /> : null}
      {value.kind === 'Cambio de aceite de motor' ? (
        <div>
          <Text size="sm" fw={500} mb={4}>Viscosidad del aceite de motor (opcional)</Text>
          <Group gap="xs" wrap="nowrap" align="center">
            <NumberInput aria-label={`Viscosidad antes de W${suffix}`} placeholder="15" value={value.viscosityWinter} onChange={(next) => onChange({ viscosityWinter: typeof next === 'number' ? next : '' })} min={0} allowDecimal={false} hideControls style={{ flex: 1, minWidth: 0 }} />
            <Text fw={700}>W-</Text>
            <NumberInput aria-label={`Viscosidad después de W${suffix}`} placeholder="40" value={value.viscosityHot} onChange={(next) => onChange({ viscosityHot: typeof next === 'number' ? next : '' })} min={0} allowDecimal={false} hideControls style={{ flex: 1, minWidth: 0 }} />
          </Group>
        </div>
      ) : value.kind === 'Cambio de aceite hidráulico' ? (
        <Select label={`Referencia del aceite hidráulico (opcional)${suffix}`} placeholder="Selecciona la referencia" data={['AW68', 'ISO68']} value={value.reference || null} onChange={(reference) => onChange({ reference: reference ?? '' })} clearable />
      ) : value.kind ? (
        <TextInput label={`${value.kind.startsWith('Cambio de filtro') ? 'Referencia del filtro (opcional)' : 'Referencia (opcional)'}${suffix}`} placeholder={value.kind.startsWith('Cambio de filtro') ? 'Escribe la referencia del filtro instalado' : 'Referencia del repuesto o servicio (opcional)'} value={value.reference} onChange={(event) => onChange({ reference: event.currentTarget.value })} />
      ) : null}
    </Stack>
  );
}
