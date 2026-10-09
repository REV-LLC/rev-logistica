"use client";
import { useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { type ConfigurationEntry, configurationError, entryName } from './types';

const ROOT = 'principal';

export default function TemplateRouteNodeOptions({ entry, entries, parentName, creating, disabled,
  onCancel, onApply, onRemove }: {
  entry: ConfigurationEntry;
  entries: ConfigurationEntry[];
  parentName: string;
  creating: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onApply: (entry: ConfigurationEntry) => void;
  onRemove: () => void;
}) {
  const [after, setAfter] = useState(entry.templateParentFamilyId ?? ROOT);
  const [error, setError] = useState('');
  const familyOptions = entries.filter(row => row.familyId && row.familyId !== entry.familyId)
    .map(row => ({ value: row.familyId!, label: entryName(row) }));
  return <Modal opened onClose={onCancel} title={entryName(entry)} centered size="sm"
    closeOnClickOutside={!disabled} closeOnEscape={!disabled} withCloseButton={!disabled}>
    <Stack>
      <Select label="Después de" value={after} allowDeselect={false} searchable disabled={disabled}
        data={[{ value: ROOT, label: parentName }, ...familyOptions]}
        onChange={value => { setAfter(value ?? ROOT); setError(''); }} />
      {error ? <Text role="alert" c="red" size="sm">{error}</Text> : null}
      {!creating ? <Button variant="subtle" color="red" disabled={disabled} onClick={() => {
        if (window.confirm('¿Quitar esta familia de la ruta? Los pasos siguientes pasarán al paso anterior. El inventario no cambia.')) onRemove();
      }}>Quitar de la ruta</Button> : null}
      <Group justify="center" wrap="wrap">
        <Button variant="default" onClick={onCancel} disabled={disabled}>Cancelar</Button>
        <Button disabled={disabled} onClick={() => {
          const next = { ...entry, templateParentFamilyId: after === ROOT ? null : after,
            recommendation: true, required: false, maximumQuantity: null, defaultIncluded: false };
          const nextEntries = creating ? [...entries, next] : entries.map(row => row.id === entry.id ? next : row);
          const issue = configurationError({ version: 0, entries: nextEntries });
          if (issue) { setError(issue); return; }
          onApply(next);
        }}>{creating ? 'Agregar a la ruta' : 'Aplicar'}</Button>
      </Group>
    </Stack>
  </Modal>;
}
