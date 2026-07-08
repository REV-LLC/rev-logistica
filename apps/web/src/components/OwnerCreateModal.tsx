'use client';

import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconBuildingWarehouse, IconId, IconPlus } from '@tabler/icons-react';
import UppercaseTextInput from '@/components/UppercaseTextInput';

export type OwnerIdentityType = 'NIT' | 'CC';

export type OwnerCreateForm = {
  name: string;
  identityType: OwnerIdentityType;
  nitNumber: string;
  nitVerificationDigit: string;
  ccNumber: string;
  phone: string;
  email: string;
};

export const emptyOwnerCreateForm: OwnerCreateForm = {
  name: '',
  identityType: 'NIT',
  nitNumber: '',
  nitVerificationDigit: '',
  ccNumber: '',
  phone: '',
  email: '',
};

const identityTypeOptions = [
  { value: 'NIT', label: 'NIT' },
  { value: 'CC', label: 'CC' },
];

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function buildOwnerNitOrId(form: OwnerCreateForm) {
  if (form.identityType === 'NIT') {
    const number = onlyDigits(form.nitNumber);
    const verificationDigit = onlyDigits(form.nitVerificationDigit).slice(0, 1);
    return number && verificationDigit ? `${number}-${verificationDigit}` : '';
  }

  return onlyDigits(form.ccNumber);
}

export function validateOwnerCreateForm(form: OwnerCreateForm) {
  if (!form.name.trim()) {
    return 'El nombre del dueño es requerido.';
  }

  if (form.identityType === 'NIT') {
    if (!onlyDigits(form.nitNumber)) {
      return 'El número de NIT es requerido.';
    }
    if (!onlyDigits(form.nitVerificationDigit)) {
      return 'El dígito de verificación del NIT es requerido.';
    }
  }

  if (form.identityType === 'CC' && !onlyDigits(form.ccNumber)) {
    return 'El número de CC es requerido.';
  }

  if (!form.phone.trim()) {
    return 'El teléfono es requerido.';
  }

  if (!form.email.trim()) {
    return 'El correo es requerido.';
  }

  return null;
}

type OwnerCreateModalProps = {
  opened: boolean;
  form: OwnerCreateForm;
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: () => void;
  onChange: (updater: (previous: OwnerCreateForm) => OwnerCreateForm) => void;
};

export default function OwnerCreateModal({
  opened,
  form,
  loading,
  error,
  onClose,
  onCreate,
  onChange,
}: OwnerCreateModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm" wrap="nowrap" align="center">
          <ThemeIcon color="blue" variant="light" radius="xl" size={40}>
            <IconBuildingWarehouse size={20} />
          </ThemeIcon>
          <Text fw={900} size="lg" lh={1.15}>
            Crear dueño
          </Text>
        </Group>
      }
      centered
      size="lg"
      radius="lg"
      styles={{
        header: { padding: '20px 22px 12px' },
        body: { padding: '0 22px 22px' },
      }}
    >
      <Stack gap="md">
        <Divider />

        <Paper withBorder radius="lg" p="md" style={{ borderColor: 'rgba(15, 23, 42, 0.08)' }}>
          <Stack gap="md">
            <UppercaseTextInput
              label="Nombre"
              placeholder="Ejemplo: VEREAL S.A."
              value={form.name}
              onChange={(value) => onChange((previous) => ({ ...previous, name: value }))}
              required
            />

            <Group align="flex-start" gap="md" grow={false}>
              <Select
                label="Tipo"
                data={identityTypeOptions}
                value={form.identityType}
                onChange={(value) =>
                  onChange((previous) => ({
                    ...previous,
                    identityType: (value as OwnerIdentityType) ?? 'NIT',
                  }))
                }
                allowDeselect={false}
                required
                w={88}
              />

              {form.identityType === 'CC' ? (
                <UppercaseTextInput
                  leftSection={<IconId size={16} />}
                  label="Número de CC"
                  placeholder="Ejemplo: 1234567890"
                  value={form.ccNumber}
                  transformValue={onlyDigits}
                  onChange={(value) => onChange((previous) => ({ ...previous, ccNumber: value }))}
                  required
                  style={{ flex: '1 1 220px' }}
                />
              ) : (
                <Group align="flex-start" gap="xs" style={{ flex: '1 1 360px' }}>
                  <UppercaseTextInput
                    leftSection={<IconId size={16} />}
                    label="Número de NIT"
                    placeholder="Ejemplo: 900123456"
                    value={form.nitNumber}
                    transformValue={onlyDigits}
                    onChange={(value) => onChange((previous) => ({ ...previous, nitNumber: value }))}
                    required
                    style={{ flex: '1 1 220px' }}
                  />
                  <UppercaseTextInput
                    label="Dígito de verificación"
                    placeholder="0"
                    value={form.nitVerificationDigit}
                    transformValue={(value) => onlyDigits(value).slice(0, 1)}
                    onChange={(value) =>
                      onChange((previous) => ({ ...previous, nitVerificationDigit: value }))
                    }
                    maxLength={1}
                    required
                    w={180}
                  />
                </Group>
              )}
            </Group>

            {form.identityType === 'NIT' ? (
              <Text size="xs" c="dimmed">
                Se guardará como {buildOwnerNitOrId(form) || 'número-dígito'}, por ejemplo 900123456-7.
              </Text>
            ) : null}
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="md" style={{ borderColor: 'rgba(15, 23, 42, 0.08)' }}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <UppercaseTextInput
                label="Teléfono"
              placeholder="Ejemplo: 3001234567"
              value={form.phone}
              onChange={(value) => onChange((previous) => ({ ...previous, phone: value }))}
              required
            />
            <UppercaseTextInput
              label="Correo"
              placeholder="Ejemplo: ADMIN@EMPRESA.COM"
              type="email"
              value={form.email}
              onChange={(value) => onChange((previous) => ({ ...previous, email: value }))}
              required
            />
          </SimpleGrid>
        </Paper>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo crear el dueño">
            {error}
          </Alert>
        ) : null}

        <Group justify="space-between" className="mobile-actions">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={onCreate} loading={loading}>
            Crear dueño
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
