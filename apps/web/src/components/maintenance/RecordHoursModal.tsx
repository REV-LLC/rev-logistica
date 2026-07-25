'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, FileButton, Group, Modal, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconCamera, IconPhoto } from '@tabler/icons-react';
import { api } from '@/lib/api';
import { apiErrorMessage, type MaintenanceSubject } from '@/lib/maintenance-types';

type Props = {
  opened: boolean;
  subject: MaintenanceSubject;
  currentHours: number;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function currentLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function RecordHoursModal({
  opened,
  subject,
  currentHours,
  onClose,
  onSaved,
}: Props) {
  const [hours, setHours] = useState<number | ''>(currentHours);
  const [recordedAt, setRecordedAt] = useState(currentLocalDateTime);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setHours(currentHours);
    setRecordedAt(currentLocalDateTime());
    setNote('');
    setEvidence(null);
    setError(null);
  }, [currentHours, opened]);

  const save = async () => {
    if (hours === '' || hours <= currentHours) {
      setError(`La nueva lectura debe ser superior a ${currentHours} horas.`);
      return;
    }
    if (subject.type === 'ASSET' && !evidence) {
      setError('Debes adjuntar una fotografía visible del horómetro.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const route = subject.type === 'ASSET' ? 'assets' : 'vehicles';
      let evidenceFileObjectId: string | undefined;
      if (subject.type === 'ASSET' && evidence) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(evidence.type)) {
          throw new Error('La evidencia debe ser una imagen PNG, JPG o WEBP.');
        }
        const formData = new FormData();
        formData.append('files', evidence);
        formData.append('category', 'MANTENIMIENTO');
        formData.append('displayName', `Evidencia horómetro ${hours} h`);
        const upload = await api<{ files: Array<{ id: string }> }>(
          `/files/entities/ASSET/${subject.id}`,
          { method: 'POST', body: formData },
        );
        evidenceFileObjectId = upload.files[0]?.id;
        if (!evidenceFileObjectId) {
          throw new Error('No se pudo guardar la evidencia fotográfica.');
        }
      }
      await api(`/maintenance/${route}/${subject.id}/hours`, {
        method: 'POST',
        json: {
          hours,
          recordedAt: recordedAt ? new Date(recordedAt).toISOString() : undefined,
          note: note.trim() || undefined,
          evidenceFileObjectId,
        },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo registrar la lectura.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Registrar horas · ${subject.label}`} centered>
      <Stack gap="md">
        <div>
          <Text size="sm" c="dimmed">Horómetro actual</Text>
          <Text fw={800} size="xl">{currentHours} h</Text>
        </div>
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <NumberInput
          label="Nueva lectura"
          value={hours}
          onChange={(value) => setHours(typeof value === 'number' ? value : '')}
          min={currentHours}
          decimalScale={2}
          step={0.1}
          suffix=" horas"
          required
        />
        <TextInput
          label="Fecha de lectura"
          type="datetime-local"
          value={recordedAt}
          onChange={(event) => setRecordedAt(event.currentTarget.value)}
        />
        <TextInput
          label="Nota"
          placeholder="Ej. Lectura al regresar del alquiler"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        {subject.type === 'ASSET' ? (
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" align="center" gap="md">
              <Group gap="sm" wrap="nowrap">
                <IconPhoto size={20} />
                <div>
                  <Text size="sm" fw={700}>Evidencia fotográfica</Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {evidence?.name ?? 'Fotografía clara del tablero y la lectura.'}
                  </Text>
                </div>
              </Group>
              <FileButton
                onChange={setEvidence}
                accept="image/png,image/jpeg,image/webp"
              >
                {(props) => (
                  <Button {...props} variant="light" leftSection={<IconCamera size={16} />}>
                    {evidence ? 'Cambiar' : 'Adjuntar'}
                  </Button>
                )}
              </FileButton>
            </Group>
          </Paper>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Registrar lectura</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
