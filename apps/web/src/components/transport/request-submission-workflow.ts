import { api } from '@/lib/api';
import { enqueueOfflineOperation } from '@/lib/offline-queue';
import { buildRequestItems } from '@/components/transport/request-items';
import {
  normalizeLocalWhatsappPhone,
  validateRequestSubmission,
} from '@/components/transport/request-submission';
import {
  buildAutosavePayload,
  buildDocumentPayload,
  buildDraftPersistencePayload,
} from '@/components/transport/request-payload';
import { validateOfflineFileDrafts } from '@/components/transport/file-drafts';
import { formatTransportError } from '@/components/transport/transport-errors';
import type { RequestSelectedItem } from '@/components/transport/RequestItemsStep';
import type { ProviderRemissionRequirements } from '@/components/transport/ProviderRemissionsModal';

type RequestSubmissionInput = {
  documentType: 'REMISSION' | 'RETURN';
  consecutive: string;
  warehouseId: string | null;
  principalWarehouseId: string | null;
  customerId: string | null;
  customerWorksiteId: string;
  observations: string;
  documentDate: string;
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  vehicleId: string | null;
  driverId: string | null;
  dispatcherId: string | null;
  selectedItems: RequestSelectedItem[];
  shouldSendWhatsapp: boolean;
  recipientPhoneDraft: string;
  recipientPhones: string[];
  receivedSignature: string | null;
  editingRequestId: string | null;
  autosaveDraftId: string | null;
  isAdmin: boolean;
  isDriver: boolean;
  evidencePhotoCount: number;
  providerRemissionCount: number;
  providerRequirements: ProviderRemissionRequirements | null;
  uploadEvidencePhotos: (documentId: string) => Promise<void>;
  uploadProviderRemissions: (
    documentId: string,
    providers: ProviderRemissionRequirements['providers'],
  ) => Promise<void>;
};

export type RequestSubmissionResult = {
  documentId: string;
  offline: boolean;
  message: string;
};

export async function submitRequestWorkflow(
  input: RequestSubmissionInput,
): Promise<RequestSubmissionResult> {
  const pendingPhone = input.shouldSendWhatsapp && input.recipientPhoneDraft
    ? normalizeLocalWhatsappPhone(input.recipientPhoneDraft)
    : null;
  const recipientPhones = input.shouldSendWhatsapp
    ? [...new Set([
        ...input.recipientPhones,
        ...(pendingPhone ? [pendingPhone] : []),
      ])]
    : [];
  const effectiveWarehouseId = input.warehouseId ?? input.principalWarehouseId;
  const submissionError = validateRequestSubmission({
    docType: input.documentType,
    deliveryMode: input.deliveryMode,
    docDate: input.documentDate,
    customerId: input.customerId,
    customerWorksiteId: input.customerWorksiteId,
    selectedItems: input.selectedItems,
    shouldSendWhatsapp: input.shouldSendWhatsapp,
    recipientPhoneDraft: input.recipientPhoneDraft,
    recipientPhones,
    editingRequestId: input.editingRequestId,
    receivedSignature: input.receivedSignature,
    effectiveWarehouseId,
    isDriverRole: input.isDriver,
    driverId: input.driverId,
  });
  if (submissionError) throw new Error(submissionError);

  const payloadSource = {
    docType: input.documentType,
    consecutive: input.consecutive,
    warehouseId: effectiveWarehouseId,
    customerWorksiteId: input.customerWorksiteId,
    observations: input.observations,
    docDate: input.documentDate,
    deliveryMode: input.deliveryMode,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    dispatcherId: input.dispatcherId,
    recipientPhones,
    receivedSignature: input.receivedSignature,
    items: buildRequestItems(input.selectedItems),
  };
  const documentPayload = buildDocumentPayload(payloadSource, {
    shouldSendWhatsapp: input.shouldSendWhatsapp,
    editingRequestId: input.editingRequestId,
    isAdminRole: input.isAdmin,
  });
  const persistencePayload = buildDraftPersistencePayload(
    buildAutosavePayload(payloadSource),
    documentPayload,
  );

  if (!navigator.onLine) {
    if (!input.autosaveDraftId) {
      throw new Error(
        'Este formulario todavía no tiene un borrador en el servidor. Recupera la conexión para iniciar el borrador y vuelve a intentarlo.',
      );
    }
    const fileError = validateOfflineFileDrafts({
      evidencePhotoCount: input.evidencePhotoCount,
      providerRemissionCount: input.providerRemissionCount,
    });
    if (fileError) throw new Error(fileError);

    const autosaveOperation = await enqueueOfflineOperation({
      label: `Guardar borrador ${input.autosaveDraftId.slice(0, 8)}`,
      path: `/documents/${input.autosaveDraftId}/request/autosave`,
      method: 'PATCH',
      body: persistencePayload,
    });
    const submitOperation = await enqueueOfflineOperation({
      label: `Enviar solicitud ${input.autosaveDraftId.slice(0, 8)}`,
      path: `/documents/${input.autosaveDraftId}/request/submit`,
      body: { sendWhatsapp: input.shouldSendWhatsapp },
      dependsOn: [autosaveOperation.id],
    });
    await enqueueOfflineOperation({
      label: `Enviar correo ${input.autosaveDraftId.slice(0, 8)}`,
      path: `/documents/${input.autosaveDraftId}/customer-email/draft`,
      dependsOn: [submitOperation.id],
    });
    if (input.shouldSendWhatsapp) {
      await enqueueOfflineOperation({
        label: `Enviar WhatsApp ${input.autosaveDraftId.slice(0, 8)}`,
        path: `/documents/${input.autosaveDraftId}/customer-messages/draft`,
        dependsOn: [submitOperation.id],
      });
    }
    return {
      documentId: input.autosaveDraftId,
      offline: true,
      message: 'Solicitud guardada en este dispositivo. Se sincronizará automáticamente al recuperar la conexión.',
    };
  }

  let created: { id: string };
  if (input.autosaveDraftId) {
    await api(`/documents/${input.autosaveDraftId}/request/autosave`, {
      method: 'PATCH',
      json: persistencePayload,
    });
    created = await api<{ id: string }>(
      `/documents/${input.autosaveDraftId}/request/submit`,
      { method: 'POST', json: { sendWhatsapp: input.shouldSendWhatsapp } },
    );
  } else {
    created = await api<{ id: string }>(
      input.editingRequestId
        ? `/documents/${input.editingRequestId}/request`
        : '/documents/requests',
      {
        method: input.editingRequestId ? 'PATCH' : 'POST',
        json: { ...documentPayload, items: persistencePayload.items },
      },
    );
  }

  try {
    await Promise.all([
      input.uploadEvidencePhotos(created.id),
      input.uploadProviderRemissions(
        created.id,
        input.providerRequirements?.providers ?? [],
      ),
    ]);
    if (!input.editingRequestId) {
      await api(`/documents/${created.id}/customer-email/draft`, { method: 'POST' });
      if (input.shouldSendWhatsapp) {
        await api(`/documents/${created.id}/customer-messages/draft`, { method: 'POST' });
      }
    }
  } catch (error) {
    const message = formatTransportError(error, 'No se pudieron subir los archivos.');
    throw new Error(
      `La solicitud se guardó (${created.id}), pero fallaron los archivos: ${message}`,
    );
  }

  return {
    documentId: created.id,
    offline: false,
    message: input.editingRequestId
      ? `Solicitud actualizada (${created.id}).`
      : `Solicitud enviada como borrador (${created.id}).`,
  };
}
