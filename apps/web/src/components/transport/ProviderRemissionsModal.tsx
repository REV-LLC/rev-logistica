'use client';

import { Alert, Button, FileInput, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { IconCamera } from '@tabler/icons-react';
import type { ProviderRemissionRequirement } from '@/components/transport/approval-errors';
import type { ImageFileDraft } from '@/components/transport/file-drafts';

export type ProviderRemissionRequirements = {
  required: boolean;
  providers: ProviderRemissionRequirement[];
  missingProviders: ProviderRemissionRequirement[];
};

export type ProviderRemissionModalState = {
  mode: 'OPTIONAL' | 'REQUIRED';
  requirements: ProviderRemissionRequirements;
  documentId?: string;
};

type ProviderRemissionsModalProps = {
  state: ProviderRemissionModalState | null;
  drafts: Record<string, ImageFileDraft>;
  error: string | null;
  uploading: boolean;
  onSelect: (providerWarehouseId: string, file: File | null) => void;
  onClose: () => void;
  onContinue: () => void;
  onSubmit: () => void;
};

export default function ProviderRemissionsModal({
  state,
  drafts,
  error,
  uploading,
  onSelect,
  onClose,
  onContinue,
  onSubmit,
}: ProviderRemissionsModalProps) {
  const isRequired = state?.mode === 'REQUIRED';
  const hasDraft = state?.requirements.missingProviders.some(
    (provider) => Boolean(drafts[provider.providerWarehouseId]),
  );

  return (
    <Modal
      opened={Boolean(state)}
      onClose={onClose}
      title={isRequired ? 'Remisión física requerida' : 'Remisiones de proveedores detectadas'}
      centered
      size="lg"
      closeOnClickOutside={!uploading}
      closeOnEscape={!uploading}
    >
      <Stack gap="md">
        <Alert color={isRequired ? 'orange' : 'blue'} variant="light">
          {isRequired
            ? 'No puedes aprobar esta solicitud hasta adjuntar una remisión física por cada proveedor pendiente.'
            : 'Puedes adjuntar las remisiones ahora o continuar y dejar que Office las complete antes de aprobar.'}
        </Alert>

        {(state?.requirements.missingProviders ?? []).map((provider) => {
          const draft = drafts[provider.providerWarehouseId];
          return (
            <Paper key={provider.providerWarehouseId} withBorder radius="md" p="md">
              <Stack gap="sm">
                <div>
                  <Text fw={700}>{provider.providerName}</Text>
                  <Text size="sm" c="dimmed">
                    Tienes {provider.quantity} item{provider.quantity === 1 ? '' : 's'} de este proveedor
                    {provider.itemCount !== provider.quantity
                      ? ` en ${provider.itemCount} línea${provider.itemCount === 1 ? '' : 's'}`
                      : ''}.
                  </Text>
                </div>
                <FileInput
                  label={`Remisión física de ${provider.providerName}`}
                  placeholder="Tomar o seleccionar foto"
                  accept="image/png,image/jpeg,image/webp"
                  capture="environment"
                  clearable
                  value={draft?.file ?? null}
                  onChange={(file) => onSelect(provider.providerWarehouseId, file)}
                  leftSection={<IconCamera size={16} />}
                />
                {draft ? (
                  <img
                    src={draft.previewUrl}
                    alt={`Remisión física de ${provider.providerName}`}
                    style={{
                      width: '100%',
                      maxWidth: 360,
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 8,
                    }}
                  />
                ) : null}
              </Stack>
            </Paper>
          );
        })}

        {error ? <Alert color="red" variant="light">{error}</Alert> : null}

        <Group justify="flex-end" className="mobile-actions">
          {state?.mode === 'OPTIONAL' ? (
            <>
              <Button variant="default" onClick={onContinue}>Omitir por ahora</Button>
              <Button disabled={!hasDraft} onClick={onContinue}>Guardar fotos y continuar</Button>
            </>
          ) : (
            <>
              <Button variant="default" disabled={uploading} onClick={onClose}>Cancelar</Button>
              <Button loading={uploading} onClick={onSubmit}>Subir y aprobar</Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
