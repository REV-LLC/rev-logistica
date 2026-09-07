'use client';
import {
  Alert,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { IconCamera } from '@tabler/icons-react';
import type { Dispatch, SetStateAction } from 'react';
import {
  EvidencePhotoDraft,
  GenerateStep,
  ProviderRemissionModalState,
} from './request-types';

type Props = {
  providerRemissionModal: ProviderRemissionModalState | null;
  providerRemissionUploading: boolean;
  setProviderRemissionModal: Dispatch<
    SetStateAction<ProviderRemissionModalState | null>
  >;
  setProviderRemissionError: Dispatch<SetStateAction<string | null>>;
  providerRemissionDrafts: Record<string, EvidencePhotoDraft>;
  selectProviderRemissionDocument: (
    providerWarehouseId: string,
    file: File | null,
  ) => void;
  providerRemissionError: string | null;
  setGenerateStep: Dispatch<SetStateAction<GenerateStep>>;
  uploadMissingProviderRemissionsAndApprove: () => Promise<void>;
};

export default function ProviderRemissionDialog({
  providerRemissionModal,
  providerRemissionUploading,
  setProviderRemissionModal,
  setProviderRemissionError,
  providerRemissionDrafts,
  selectProviderRemissionDocument,
  providerRemissionError,
  setGenerateStep,
  uploadMissingProviderRemissionsAndApprove,
}: Props) {
  return (
    <Modal
      opened={Boolean(providerRemissionModal)}
      onClose={() => {
        if (providerRemissionUploading) return;
        setProviderRemissionModal(null);
        setProviderRemissionError(null);
      }}
      title={
        providerRemissionModal?.mode === 'REQUIRED'
          ? 'Remisión física requerida'
          : 'Remisiones de proveedores detectadas'
      }
      centered
      size="lg"
      closeOnClickOutside={!providerRemissionUploading}
      closeOnEscape={!providerRemissionUploading}
    >
      <Stack gap="md">
        <Alert
          color={
            providerRemissionModal?.mode === 'REQUIRED' ? 'orange' : 'blue'
          }
          variant="light"
        >
          {providerRemissionModal?.mode === 'REQUIRED'
            ? 'No puedes aprobar esta solicitud hasta adjuntar una remisión física por cada proveedor pendiente.'
            : 'Puedes adjuntar las remisiones ahora o continuar y dejar que Office las complete antes de aprobar.'}
        </Alert>

        {(providerRemissionModal?.requirements.missingProviders ?? []).map(
          (provider) => {
            const draft = providerRemissionDrafts[provider.providerWarehouseId];
            return (
              <Paper
                key={provider.providerWarehouseId}
                withBorder
                radius="md"
                p="md"
              >
                <Stack gap="sm">
                  <div>
                    <Text fw={700}>{provider.providerName}</Text>
                    <Text size="sm" c="dimmed">
                      Tienes {provider.quantity} item
                      {provider.quantity === 1 ? '' : 's'} de este proveedor
                      {provider.itemCount !== provider.quantity
                        ? ` en ${provider.itemCount} línea${provider.itemCount === 1 ? '' : 's'}`
                        : ''}
                      .
                    </Text>
                  </div>
                  <FileInput
                    label={`Remisión física de ${provider.providerName}`}
                    placeholder="Tomar o seleccionar foto"
                    accept="image/png,image/jpeg,image/webp"
                    capture="environment"
                    clearable
                    value={draft?.file ?? null}
                    onChange={(file) =>
                      selectProviderRemissionDocument(
                        provider.providerWarehouseId,
                        file,
                      )
                    }
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
          },
        )}

        {providerRemissionError ? (
          <Alert color="red" variant="light">
            {providerRemissionError}
          </Alert>
        ) : null}

        <Group justify="flex-end" className="mobile-actions">
          {providerRemissionModal?.mode === 'OPTIONAL' ? (
            <>
              <Button
                variant="default"
                onClick={() => {
                  setProviderRemissionModal(null);
                  setProviderRemissionError(null);
                  setGenerateStep('sign');
                }}
              >
                Omitir por ahora
              </Button>
              <Button
                disabled={
                  !providerRemissionModal.requirements.missingProviders.some(
                    (provider) =>
                      Boolean(
                        providerRemissionDrafts[provider.providerWarehouseId],
                      ),
                  )
                }
                onClick={() => {
                  setProviderRemissionModal(null);
                  setProviderRemissionError(null);
                  setGenerateStep('sign');
                }}
              >
                Guardar fotos y continuar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="default"
                disabled={providerRemissionUploading}
                onClick={() => {
                  setProviderRemissionModal(null);
                  setProviderRemissionError(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                loading={providerRemissionUploading}
                onClick={() => void uploadMissingProviderRemissionsAndApprove()}
              >
                Subir y aprobar
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
