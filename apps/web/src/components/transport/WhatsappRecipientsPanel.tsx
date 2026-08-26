'use client';

import { Alert, Badge, Button, Group, Paper, Stack, Switch, Text, TextInput } from '@mantine/core';

export type DefaultWhatsappRecipient = {
  key: string;
  label: string;
  phone: string | null;
};

type WhatsappRecipientsPanelProps = {
  canDecide: boolean;
  enabled: boolean;
  sendWhatsapp: boolean;
  defaultRecipients: DefaultWhatsappRecipient[];
  additionalPhones: string[];
  phoneDraft: string;
  error: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onPhoneDraftChange: (phone: string) => void;
  onAdd: () => void;
  onRemove: (phone: string) => void;
};

export default function WhatsappRecipientsPanel({
  canDecide,
  enabled,
  sendWhatsapp,
  defaultRecipients,
  additionalPhones,
  phoneDraft,
  error,
  onEnabledChange,
  onPhoneDraftChange,
  onAdd,
  onRemove,
}: WhatsappRecipientsPanelProps) {
  return (
    <Paper withBorder radius="lg" p="md" mb="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Text fw={700}>Destinatarios de WhatsApp</Text>
            <Text size="sm" c="dimmed">
              El encargado de obra y el cliente se agregan automáticamente. Puedes sumar otros números.
            </Text>
          </div>
          {canDecide ? (
            <Switch
              checked={sendWhatsapp}
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
              label="Enviar por WhatsApp"
            />
          ) : null}
        </Group>

        {enabled ? (
          <>
            {defaultRecipients.map((recipient) => (
              <Group key={recipient.key} justify="space-between" align="center" wrap="nowrap">
                <div>
                  <Text size="sm" fw={700}>{recipient.label}</Text>
                  <Text size="xs" c="dimmed">Destinatario predeterminado</Text>
                </div>
                {recipient.phone ? (
                  <Badge color="green" variant="light">+57 {recipient.phone}</Badge>
                ) : (
                  <Badge color="gray" variant="light">Sin teléfono registrado</Badge>
                )}
              </Group>
            ))}

            {additionalPhones.map((phone, index) => (
              <Group key={phone} justify="space-between" align="center" wrap="nowrap">
                <div>
                  <Text size="sm" fw={700}>Destinatario adicional {index + 1}</Text>
                  <Text size="xs" c="dimmed">+57 {phone}</Text>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => onRemove(phone)}
                >
                  Quitar
                </Button>
              </Group>
            ))}

            <Group align="flex-end" wrap="wrap">
              <TextInput
                label="Agregar otro número"
                description="Escribe únicamente los 10 dígitos; el sistema agrega +57."
                leftSection="+57"
                inputMode="numeric"
                maxLength={10}
                value={phoneDraft}
                onChange={(event) =>
                  onPhoneDraftChange(event.currentTarget.value.replace(/\D/g, '').slice(0, 10))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onAdd();
                  }
                }}
                placeholder="3001234567"
                style={{ flex: '1 1 260px' }}
              />
              <Button type="button" variant="light" onClick={onAdd}>Agregar</Button>
            </Group>
            {error ? <Text size="xs" c="red">{error}</Text> : null}
          </>
        ) : (
          <Alert color="gray" variant="light">
            El documento se creará sin exigir teléfonos ni enviar una copia por WhatsApp.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
