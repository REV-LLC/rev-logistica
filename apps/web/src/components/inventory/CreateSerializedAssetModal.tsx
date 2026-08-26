'use client';

import { useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

export type CreateSerializedAssetValues = {
  serialOrEngine: string;
  internalNumber: number;
  brand?: string;
  model?: string;
  year?: number;
  fuel?: string;
};

type CreateSerializedAssetModalProps = {
  opened: boolean;
  initialInternalNumber?: number | null;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: CreateSerializedAssetValues) => Promise<void>;
};

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diésel' },
  { value: 'ELECTRICO', label: 'Eléctrico' },
];

export default function CreateSerializedAssetModal({
  opened,
  initialInternalNumber = null,
  title = 'Crear equipo serializado',
  submitLabel = 'Crear equipo',
  onClose,
  onSubmit,
}: CreateSerializedAssetModalProps) {
  const [serialOrEngine, setSerialOrEngine] = useState('');
  const [internalNumber, setInternalNumber] = useState<number | ''>(
    initialInternalNumber ?? '',
  );
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [fuel, setFuel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (!saving) onClose();
  };

  const submit = async () => {
    const normalizedSerial = serialOrEngine.trim();
    if (!normalizedSerial) {
      setError('El serial o motor es obligatorio.');
      return;
    }
    if (internalNumber === '' || internalNumber <= 0) {
      setError('El número interno debe ser mayor que cero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        serialOrEngine: normalizedSerial,
        internalNumber,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        year: year === '' ? undefined : year,
        fuel: fuel ?? undefined,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'No se pudo crear el equipo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={title}
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Stack gap="sm">
        {error ? <Text c="red">{error}</Text> : null}
        <TextInput
          label="Serial / motor"
          value={serialOrEngine}
          onChange={(event) => setSerialOrEngine(event.currentTarget.value)}
          required
        />
        <NumberInput
          label="Número interno"
          value={internalNumber}
          onChange={(value) => setInternalNumber(typeof value === 'number' ? value : '')}
          min={1}
          required
        />
        <Group grow>
          <TextInput
            label="Marca (opcional)"
            value={brand}
            onChange={(event) => setBrand(event.currentTarget.value)}
          />
          <TextInput
            label="Modelo (opcional)"
            value={model}
            onChange={(event) => setModel(event.currentTarget.value)}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Año (opcional)"
            value={year}
            onChange={(value) => setYear(typeof value === 'number' ? value : '')}
            min={1900}
            max={2100}
          />
          <Select
            label="Combustible (opcional)"
            data={FUEL_OPTIONS}
            value={fuel}
            onChange={setFuel}
            clearable
          />
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
