'use client';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type { Dispatch, SetStateAction } from 'react';
import { FUEL_OPTIONS } from './request-formatting';

type Props = {
  ownerName: string;
  physicalSourceName: string;
  createSerialOpen: boolean;
  createSerialSaving: boolean;
  setCreateSerialOpen: Dispatch<SetStateAction<boolean>>;
  setCreateSerialIndex: Dispatch<SetStateAction<number | null>>;
  setCreateSerialError: Dispatch<SetStateAction<string | null>>;
  setCreateSerialBrand: Dispatch<SetStateAction<string>>;
  setCreateSerialModel: Dispatch<SetStateAction<string>>;
  setCreateSerialYear: Dispatch<SetStateAction<number | ''>>;
  setCreateSerialFuel: Dispatch<SetStateAction<string | null>>;
  createSerialError: string | null;
  createSerialSerialOrEngine: string;
  setCreateSerialSerialOrEngine: Dispatch<SetStateAction<string>>;
  createSerialInternalNumber: number | '';
  setCreateSerialInternalNumber: Dispatch<SetStateAction<number | ''>>;
  createSerialBrand: string;
  createSerialModel: string;
  createSerialYear: number | '';
  createSerialFuel: string | null;
  createMissingSerialFromResolve: () => Promise<void>;
};

export default function ApprovalCreateAssetDialog({
  ownerName,
  physicalSourceName,
  createSerialOpen,
  createSerialSaving,
  setCreateSerialOpen,
  setCreateSerialIndex,
  setCreateSerialError,
  setCreateSerialBrand,
  setCreateSerialModel,
  setCreateSerialYear,
  setCreateSerialFuel,
  createSerialError,
  createSerialSerialOrEngine,
  setCreateSerialSerialOrEngine,
  createSerialInternalNumber,
  setCreateSerialInternalNumber,
  createSerialBrand,
  createSerialModel,
  createSerialYear,
  createSerialFuel,
  createMissingSerialFromResolve,
}: Props) {
  return (
    <Modal
      opened={createSerialOpen}
      onClose={() => {
        if (createSerialSaving) return;
        setCreateSerialOpen(false);
        setCreateSerialIndex(null);
        setCreateSerialError(null);
        setCreateSerialBrand('');
        setCreateSerialModel('');
        setCreateSerialYear('');
        setCreateSerialFuel(null);
      }}
      title="Crear equipo serializado faltante"
      centered
    >
      <Stack gap="sm">
        <Alert color="blue" title="Registro inicial del equipo">
          Propietario: {ownerName}. Ubicación inicial: {physicalSourceName}.
          Crea el equipo solo si aún no existe; si ya está registrado, registra su ingreso a la bodega de salida sin duplicarlo.
        </Alert>
        {createSerialError ? <Text c="red">{createSerialError}</Text> : null}
        <TextInput
          label="Serial / motor"
          value={createSerialSerialOrEngine}
          onChange={(event) =>
            setCreateSerialSerialOrEngine(event.currentTarget.value)
          }
          required
        />
        <NumberInput
          label="Internal number"
          value={createSerialInternalNumber}
          onChange={(value) =>
            setCreateSerialInternalNumber(
              typeof value === 'number' ? value : '',
            )
          }
          min={1}
          required
        />
        <Group grow>
          <TextInput
            label="Marca (opcional)"
            value={createSerialBrand}
            onChange={(event) =>
              setCreateSerialBrand(event.currentTarget.value)
            }
          />
          <TextInput
            label="Modelo (opcional)"
            value={createSerialModel}
            onChange={(event) =>
              setCreateSerialModel(event.currentTarget.value)
            }
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Year (optional)"
            value={createSerialYear}
            onChange={(value) =>
              setCreateSerialYear(typeof value === 'number' ? value : '')
            }
            min={1900}
            max={2100}
          />
          <Select
            label="Combustible (opcional)"
            data={FUEL_OPTIONS}
            value={createSerialFuel}
            onChange={(value) => setCreateSerialFuel(value)}
            clearable
          />
        </Group>
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              if (createSerialSaving) return;
              setCreateSerialOpen(false);
              setCreateSerialIndex(null);
              setCreateSerialError(null);
              setCreateSerialBrand('');
              setCreateSerialModel('');
              setCreateSerialYear('');
              setCreateSerialFuel(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={createMissingSerialFromResolve}
            loading={createSerialSaving}
          >
            Crear y usar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
