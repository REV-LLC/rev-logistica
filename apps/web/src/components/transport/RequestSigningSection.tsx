'use client';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCamera, IconTrash } from '@tabler/icons-react';
import type { Dispatch, JSX, RefObject, SetStateAction } from 'react';
import {
  Customer,
  EvidencePhotoDraft,
  GenerateFieldErrors,
  GenerateStep,
  SelectedItem,
} from './request-types';

type Props = {
  handleSubmit: () => Promise<void>;
  receivedSignature: string | null;
  setGenerateStep: Dispatch<SetStateAction<GenerateStep>>;
  renderGenerateError: () => JSX.Element | null;
  selectedCustomer: Customer | null;
  selectedWorksiteLabel: string;
  docDate: string;
  selectedItems: SelectedItem[];
  canDecide: boolean;
  sendWhatsapp: boolean;
  setSendWhatsapp: Dispatch<SetStateAction<boolean>>;
  setGenerateFieldErrors: Dispatch<SetStateAction<GenerateFieldErrors>>;
  shouldSendWhatsapp: boolean;
  defaultWhatsappRecipients: {
    key: string;
    label: string;
    phone: string | null;
  }[];
  manualWhatsappPhones: string[];
  removeWhatsappRecipient: (phone: string) => void;
  recipientPhoneDraft: string;
  setRecipientPhoneDraft: Dispatch<SetStateAction<string>>;
  addWhatsappRecipient: () => void;
  generateFieldErrors: GenerateFieldErrors;
  isTabletOrMobile: boolean;
  docType: 'REMISSION' | 'RETURN';
  selectedItemsTotalQuantity: number;
  customerSignatureLabel: 'Firma de quien entrega' | 'Firma de recibido';
  editingRequestId: string | null;
  isAdminRole: boolean;
  setReceivedSignature: Dispatch<SetStateAction<string | null>>;
  setSignatureDraft: Dispatch<SetStateAction<string | null>>;
  setSignatureModalOpen: Dispatch<SetStateAction<boolean>>;
  evidenceInputRef: RefObject<HTMLInputElement | null>;
  evidencePhotos: EvidencePhotoDraft[];
  clearEvidencePhotos: () => void;
  addEvidencePhotos: (fileList: FileList | null) => void;
  removeEvidencePhoto: (photoId: string) => void;
  submitResult: string | null;
  submitting: boolean;
};

export default function RequestSigningSection({
  handleSubmit,
  receivedSignature,
  setGenerateStep,
  renderGenerateError,
  selectedCustomer,
  selectedWorksiteLabel,
  docDate,
  selectedItems,
  canDecide,
  sendWhatsapp,
  setSendWhatsapp,
  setGenerateFieldErrors,
  shouldSendWhatsapp,
  defaultWhatsappRecipients,
  manualWhatsappPhones,
  removeWhatsappRecipient,
  recipientPhoneDraft,
  setRecipientPhoneDraft,
  addWhatsappRecipient,
  generateFieldErrors,
  isTabletOrMobile,
  docType,
  selectedItemsTotalQuantity,
  customerSignatureLabel,
  editingRequestId,
  isAdminRole,
  setReceivedSignature,
  setSignatureDraft,
  setSignatureModalOpen,
  evidenceInputRef,
  evidencePhotos,
  clearEvidencePhotos,
  addEvidencePhotos,
  removeEvidencePhoto,
  submitResult,
  submitting,
}: Props) {
  return (
    <Paper
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      shadow="sm"
      p={{ base: 'md', md: 'xl' }}
      radius="xl"
      withBorder
      mt="lg"
    >
      <Group justify="space-between" align="center" mb="sm">
        <div>
          <Group gap="xs" mb={4}>
            <Badge color="orange" variant="light">
              Paso 3
            </Badge>
            <Badge color={receivedSignature ? 'green' : 'gray'} variant="light">
              {receivedSignature ? 'Firma lista' : 'Firma pendiente'}
            </Badge>
          </Group>
          <Title order={4}>Firma y envio</Title>
          <Text size="sm" c="dimmed">
            Verifica el resumen final, captura la firma y envia la solicitud.
          </Text>
        </div>
        <Button
          type="button"
          variant="light"
          color="gray"
          onClick={() => setGenerateStep('items')}
        >
          Volver a items
        </Button>
      </Group>
      {renderGenerateError()}

      <Paper withBorder radius="lg" p="md" bg="orange.0" mb="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Cliente
            </Text>
            <Text size="sm" fw={700}>
              {selectedCustomer?.name ?? '-'}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Obra
            </Text>
            <Text size="sm" fw={700}>
              {selectedWorksiteLabel}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Fecha
            </Text>
            <Text size="sm" fw={700}>
              {docDate || '-'}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Items
            </Text>
            <Text size="sm" fw={700}>
              {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}
            </Text>
          </div>
        </SimpleGrid>
      </Paper>

      <Paper withBorder radius="lg" p="md" mb="md">
        <Stack gap="sm">
          <Group
            justify="space-between"
            align="flex-start"
            wrap="wrap"
            gap="sm"
          >
            <div>
              <Text fw={700}>Destinatarios de WhatsApp</Text>
              <Text size="sm" c="dimmed">
                El encargado de obra y el cliente se agregan automáticamente.
                Puedes sumar otros números.
              </Text>
            </div>
            {canDecide ? (
              <Switch
                checked={sendWhatsapp}
                onChange={(event) => {
                  setSendWhatsapp(event.currentTarget.checked);
                  setGenerateFieldErrors((prev) => ({
                    ...prev,
                    recipientPhones: undefined,
                  }));
                }}
                label="Enviar por WhatsApp"
              />
            ) : null}
          </Group>

          {shouldSendWhatsapp ? (
            <>
              {defaultWhatsappRecipients.map((recipient) => (
                <Group
                  key={recipient.key}
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                >
                  <div>
                    <Text size="sm" fw={700}>
                      {recipient.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Destinatario predeterminado
                    </Text>
                  </div>
                  {recipient.phone ? (
                    <Badge color="green" variant="light">
                      +57 {recipient.phone}
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light">
                      Sin teléfono registrado
                    </Badge>
                  )}
                </Group>
              ))}

              {manualWhatsappPhones.map((phone, index) => (
                <Group
                  key={phone}
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                >
                  <div>
                    <Text size="sm" fw={700}>
                      Destinatario adicional {index + 1}
                    </Text>
                    <Text size="xs" c="dimmed">
                      +57 {phone}
                    </Text>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => removeWhatsappRecipient(phone)}
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
                  value={recipientPhoneDraft}
                  onChange={(event) => {
                    setRecipientPhoneDraft(
                      event.currentTarget.value.replace(/\D/g, '').slice(0, 10),
                    );
                    setGenerateFieldErrors((prev) => ({
                      ...prev,
                      recipientPhones: undefined,
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addWhatsappRecipient();
                    }
                  }}
                  placeholder="3001234567"
                  style={{ flex: '1 1 260px' }}
                />
                <Button
                  type="button"
                  variant="light"
                  onClick={addWhatsappRecipient}
                >
                  Agregar
                </Button>
              </Group>
              {generateFieldErrors.recipientPhones ? (
                <Text size="xs" c="red">
                  {generateFieldErrors.recipientPhones}
                </Text>
              ) : null}
            </>
          ) : (
            <Alert color="gray" variant="light">
              El documento se creará sin exigir teléfonos ni enviar una copia
              por WhatsApp.
            </Alert>
          )}
        </Stack>
      </Paper>

      {isTabletOrMobile ? (
        <Stack gap="xs" mb="md">
          {selectedItems.map((item) => (
            <Paper key={item.selectionId} withBorder radius="md" p="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {item.name}
                  </Text>
                  {docType === 'RETURN' && item.isDamaged ? (
                    <Text
                      size="xs"
                      c="red"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      Dañado:{' '}
                      {item.damageDescription?.trim() || 'Sin descripcion'}
                    </Text>
                  ) : null}
                </div>
                <Text fw={800} ta="right" style={{ flex: '0 0 auto' }}>
                  {item.type === 'serial' ? 1 : (item.quantity ?? 1)}
                </Text>
              </Group>
            </Paper>
          ))}
          <Paper withBorder radius="md" p="sm" bg="gray.0">
            <Group justify="space-between" wrap="nowrap">
              <Text fw={800}>Total</Text>
              <Text fw={900}>{selectedItemsTotalQuantity}</Text>
            </Group>
          </Paper>
        </Stack>
      ) : (
        <Table striped highlightOnHover mb="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th style={{ width: 110, textAlign: 'center' }}>
                Cantidad
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {selectedItems.map((item) => (
              <Table.Tr key={item.selectionId}>
                <Table.Td>
                  <Text>{item.name}</Text>
                  {docType === 'RETURN' && item.isDamaged ? (
                    <Text size="xs" c="red">
                      Dañado:{' '}
                      {item.damageDescription?.trim() || 'Sin descripcion'}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  {item.type === 'serial' ? 1 : (item.quantity ?? 1)}
                </Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td>
                <Text fw={800}>Total</Text>
              </Table.Td>
              <Table.Td style={{ textAlign: 'center' }}>
                <Text fw={800}>{selectedItemsTotalQuantity}</Text>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}

      <Stack gap="xs">
        <Text fw={600}>{customerSignatureLabel}</Text>
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {receivedSignature ? 'Firma capturada' : 'Sin firma'}
          </Text>
          {editingRequestId && !isAdminRole ? (
            <Text size="xs" c="dimmed">
              Firma bloqueada durante la edicion
            </Text>
          ) : (
            <Group gap="xs">
              {editingRequestId && receivedSignature ? (
                <Button
                  type="button"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setReceivedSignature(null);
                    setSignatureDraft(null);
                  }}
                >
                  Eliminar firma
                </Button>
              ) : null}
              <Button
                type="button"
                variant="light"
                onClick={() => {
                  setSignatureDraft(receivedSignature);
                  setSignatureModalOpen(true);
                }}
              >
                {receivedSignature ? 'Cambiar firma' : 'Firmar'}
              </Button>
            </Group>
          )}
        </Group>
        {receivedSignature ? (
          <img
            src={receivedSignature}
            alt={customerSignatureLabel}
            style={{
              width: '100%',
              maxWidth: 420,
              height: 110,
              objectFit: 'contain',
              border: '1px solid var(--mantine-color-gray-4)',
              borderRadius: 8,
              background: '#fff',
            }}
          />
        ) : null}
      </Stack>

      <Paper withBorder radius="lg" p="md" mt="md">
        <Stack gap="sm">
          <Group
            justify="space-between"
            align="center"
            className="mobile-stack"
          >
            <div>
              <Text fw={700}>Evidencias fotograficas</Text>
              <Text size="sm" c="dimmed">
                Toma fotos desde la tablet o adjunta imagenes antes de enviar.
              </Text>
            </div>
            <Group gap="xs">
              <Button
                type="button"
                variant="light"
                leftSection={<IconCamera size={16} />}
                onClick={() => evidenceInputRef.current?.click()}
              >
                Tomar / adjuntar
              </Button>
              {evidencePhotos.length ? (
                <Button
                  type="button"
                  variant="subtle"
                  color="red"
                  onClick={clearEvidencePhotos}
                >
                  Limpiar
                </Button>
              ) : null}
            </Group>
          </Group>
          <input
            ref={evidenceInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            multiple
            onChange={(event) => addEvidencePhotos(event.currentTarget.files)}
            style={{ display: 'none' }}
          />
          {evidencePhotos.length ? (
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
              {evidencePhotos.map((photo) => (
                <Paper key={photo.id} withBorder radius="md" p={6}>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={photo.previewUrl}
                      alt="Vista previa de evidencia"
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        borderRadius: 6,
                        display: 'block',
                      }}
                    />
                    <Button
                      type="button"
                      size="xs"
                      color="red"
                      variant="filled"
                      leftSection={<IconTrash size={12} />}
                      onClick={() => removeEvidencePhoto(photo.id)}
                      style={{ position: 'absolute', top: 6, right: 6 }}
                    >
                      Quitar
                    </Button>
                  </div>
                  <Text size="xs" c="dimmed" mt={4} truncate>
                    {photo.file.name}
                  </Text>
                </Paper>
              ))}
            </SimpleGrid>
          ) : (
            <Text size="sm" c="dimmed">
              Sin fotos adjuntas.
            </Text>
          )}
        </Stack>
      </Paper>

      {submitResult && (
        <Text c="green" mt="sm">
          {submitResult}
        </Text>
      )}

      <Group mt="md">
        <Button type="submit" loading={submitting}>
          {editingRequestId ? 'Guardar cambios' : 'Enviar solicitud'}
        </Button>
      </Group>
    </Paper>
  );
}
