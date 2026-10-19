'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { api } from '@/lib/api';
import type { LoanAccount, LoanEntry } from './loan-types';

type Props = {
  employeeId: string;
  entry: LoanEntry;
  onSaved: (account: LoanAccount) => void;
  onClose: () => void;
};

export default function LoanDescriptionModal({ employeeId, entry, onSaved, onClose }: Props) {
  const [detail, setDetail] = useState(entry.detail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const description = detail.trim();
    if (!description || description.length > 500) {
      setError('Escribe una descripción de hasta 500 caracteres.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const account = await api<LoanAccount>(`/employees/${employeeId}/loans/${entry.id}/description`, {
        method: 'PATCH', json: { detail: description },
      });
      onSaved(account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la descripción. Intenta de nuevo.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return <Modal opened onClose={() => !saving && onClose()} title="Editar descripción"
    closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
    <form onSubmit={event => void save(event)}>
      <Stack gap="md">
        <Textarea label="Descripción" value={detail} onChange={event => setDetail(event.currentTarget.value)}
          placeholder="Ej. Préstamo para teléfono" maxLength={500} required autosize minRows={2} maxRows={6}
          disabled={saving} data-autofocus />
        <Text size="xs" c="dimmed">El valor y la fecha no se modifican.</Text>
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <Group justify="flex-end" wrap="wrap">
          <Button type="button" variant="default" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving} disabled={!detail.trim() || detail.trim() === entry.detail}>
            Guardar descripción
          </Button>
        </Group>
      </Stack>
    </form>
  </Modal>;
}
