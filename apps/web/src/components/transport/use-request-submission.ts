'use client';
import { buildRequestItems } from '@/components/transport/request-items';
import { api } from '@/lib/api';
import {
  enqueueOfflineOperation,
  syncOfflineOperations,
} from '@/lib/offline-queue';
import type { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';
import { formatTransportError } from './request-errors';
import {
  buildRequestNotes,
  normalizeLocalWhatsappPhone,
} from './request-formatting';
import type {
  CustomerWorksite,
  EvidencePhotoDraft,
  ProviderRemissionRequirement,
  RequestsPageMode,
  Warehouse,
} from './request-types';
import {
  ProviderRemissionRequirements,
  SelectedItem,
  SolicitudesTab,
} from './request-types';
import type { useRequestAutosave } from './use-request-autosave';

type Options = {
  tabletEmployeeToken?: string;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  observations: string;
  vehicleId: string | null;
  dispatcherId: string | null;
  mode: RequestsPageMode;
  setSubmitResult: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  docDate: string;
  documentTimestamp: string | null;
  customerId: string | null;
  selectedItems: SelectedItem[];
  customerWorksiteId: string;
  shouldSendWhatsapp: boolean;
  recipientPhoneDraft: string;
  whatsappRecipientPhones: string[];
  editingRequestId: string | null;
  receivedSignature: string | null;
  warehouseId: string | null;
  principalWarehouse: Warehouse | null;
  docType: 'REMISSION' | 'RETURN';
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  isDriverRole: boolean;
  driverId: string | null;
  documentNumber: string | undefined;
  setConsecutive: Dispatch<SetStateAction<string>>;
  setSavedConsecutive: Dispatch<SetStateAction<string | null>>;
  isAdminRole: boolean;
  autosaveDraftId: string | null;
  evidencePhotos: EvidencePhotoDraft[];
  providerRemissionDrafts: Record<string, EvidencePhotoDraft>;
  autosavePayload: ReturnType<typeof useRequestAutosave>['autosavePayload'];
  resetGenerateForm: () => void;
  setItemsModalOpen: Dispatch<SetStateAction<boolean>>;
  setWorksites: Dispatch<SetStateAction<CustomerWorksite[]>>;
  uploadEvidencePhotos: (documentId: string) => Promise<void>;
  uploadProviderRemissionDocuments: (
    documentId: string,
    providers: ProviderRemissionRequirement[],
  ) => Promise<void>;
  creationProviderRequirements: ProviderRemissionRequirements | null;
  setActiveTab: Dispatch<SetStateAction<SolicitudesTab>>;
  fixedTab: SolicitudesTab;
  loadRequests: () => Promise<void>;
  router: ReturnType<typeof useRouter>;
};

export function useRequestSubmission({
  tabletEmployeeToken,
  setSubmitting,
  observations,
  vehicleId,
  dispatcherId,
  mode,
  setSubmitResult,
  setError,
  docDate,
  documentTimestamp,
  customerId,
  selectedItems,
  customerWorksiteId,
  shouldSendWhatsapp,
  recipientPhoneDraft,
  whatsappRecipientPhones,
  editingRequestId,
  receivedSignature,
  warehouseId,
  principalWarehouse,
  docType,
  deliveryMode,
  isDriverRole,
  driverId,
  documentNumber,
  setConsecutive,
  setSavedConsecutive,
  isAdminRole,
  autosaveDraftId,
  evidencePhotos,
  providerRemissionDrafts,
  autosavePayload,
  resetGenerateForm,
  setItemsModalOpen,
  setWorksites,
  uploadEvidencePhotos,
  uploadProviderRemissionDocuments,
  creationProviderRequirements,
  setActiveTab,
  fixedTab,
  loadRequests,
  router,
}: Options) {
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    setError(null);
    try {
      if (tabletEmployeeToken && !navigator.onLine) throw new Error('Conecta la tablet a internet para verificar al empleado y enviar el documento.');
      if (!docDate || !customerId) {
        throw new Error('Completa los campos requeridos.');
      }
      if (!documentTimestamp) {
        throw new Error('Ingresa una fecha válida y una hora entre 00:00 y 23:59.');
      }
      if (!selectedItems.length) {
        throw new Error('Selecciona al menos un item.');
      }
      if (
        selectedItems.some(
          (item) =>
            item.type === 'bulk' &&
            item.availableQuantity != null &&
            item.availableQuantity < 0,
        )
      ) {
        throw new Error(
          'Algunos items tienen alertas de inventario negativo. Ajusta stock antes de crear el documento.',
        );
      }
      if (!customerWorksiteId) {
        throw new Error('Selecciona la obra.');
      }
      const pendingRecipientPhone =
        shouldSendWhatsapp && recipientPhoneDraft
          ? normalizeLocalWhatsappPhone(recipientPhoneDraft)
          : null;
      if (shouldSendWhatsapp && recipientPhoneDraft && !pendingRecipientPhone) {
        throw new Error(
          'El número adicional debe contener exactamente 10 dígitos.',
        );
      }
      const recipientPhones = shouldSendWhatsapp
        ? [
            ...new Set([
              ...whatsappRecipientPhones,
              ...(pendingRecipientPhone ? [pendingRecipientPhone] : []),
            ]),
          ]
        : [];
      if (shouldSendWhatsapp && !recipientPhones.length) {
        throw new Error(
          'El cliente y la obra no tienen teléfono. Agrega al menos un destinatario de WhatsApp.',
        );
      }
      if (shouldSendWhatsapp && recipientPhones.length > 10) {
        throw new Error(
          'Puedes enviar el documento a máximo 10 destinatarios de WhatsApp.',
        );
      }
      if (!editingRequestId && !receivedSignature) {
        throw new Error('Captura la firma del cliente antes de enviar.');
      }
      const effectiveWarehouseId =
        warehouseId ?? principalWarehouse?.id ?? null;
      if (docType === 'RETURN' && !effectiveWarehouseId) {
        throw new Error('Selecciona la bodega para la devolucion.');
      }
      if (
        docType === 'REMISSION' &&
        deliveryMode === 'WAREHOUSE' &&
        !effectiveWarehouseId
      ) {
        throw new Error('Selecciona la bodega de despacho.');
      }
      if (
        docType === 'REMISSION' &&
        deliveryMode === 'ON_SITE' &&
        isDriverRole &&
        !driverId
      ) {
        throw new Error(
          'Tu usuario no esta vinculado a un empleado conductor.',
        );
      }
      if (docType === 'RETURN' && !driverId) {
        throw new Error(
          deliveryMode === 'ON_SITE'
            ? 'Selecciona el conductor responsable de recoger la devolución.'
            : 'Selecciona el empleado de REV que recibe la devolución.',
        );
      }
      const damagedWithoutDescription = selectedItems.find(
        (item) => item.isDamaged && !item.damageDescription?.trim(),
      );
      if (docType === 'RETURN' && damagedWithoutDescription) {
        throw new Error(
          `Describe el daño de ${damagedWithoutDescription.name}.`,
        );
      }

      const documentPayload = {
        ...(tabletEmployeeToken ? { tabletEmployeeToken } : {}),
        type: docType,
        number: documentNumber,
        warehouseId: effectiveWarehouseId ?? undefined,
        customerWorksiteId: customerWorksiteId || undefined,
        ...(shouldSendWhatsapp ? { recipientPhones } : {}),
        ...(!editingRequestId ? { sendWhatsapp: shouldSendWhatsapp } : {}),
        receivedSignature:
          editingRequestId && !isAdminRole
            ? undefined
            : (receivedSignature ?? ''),
        notes: buildRequestNotes({
          observations,
          documentTimestamp,
          docType,
          deliveryMode,
          vehicleId,
          driverId,
          dispatcherId,
        }),
      } as const;

      const movementItems = buildRequestItems(selectedItems);
      if (!navigator.onLine) {
        if (!autosaveDraftId) {
          throw new Error(
            'Este formulario todavía no tiene un borrador en el servidor. Recupera la conexión para iniciar el borrador y vuelve a intentarlo.',
          );
        }
        if (
          evidencePhotos.length ||
          Object.keys(providerRemissionDrafts).length
        ) {
          throw new Error(
            'Los archivos y fotografías todavía requieren conexión. Retíralos o envía el documento cuando vuelva la red.',
          );
        }

        const autosaveOperation = await enqueueOfflineOperation({
          label: `Guardar borrador ${autosaveDraftId.slice(0, 8)}`,
          path: `/documents/${autosaveDraftId}/request/autosave`,
          method: 'PATCH',
          body: {
            ...autosavePayload,
            ...documentPayload,
            sendWhatsapp: undefined,
            items: movementItems,
          },
        });
        const submitOperation = await enqueueOfflineOperation({
          label: `Enviar solicitud ${autosaveDraftId.slice(0, 8)}`,
          path: `/documents/${autosaveDraftId}/request/submit`,
          body: { sendWhatsapp: shouldSendWhatsapp },
          dependsOn: [autosaveOperation.id],
        });
        await enqueueOfflineOperation({
          label: `Enviar correo ${autosaveDraftId.slice(0, 8)}`,
          path: `/documents/${autosaveDraftId}/customer-email/draft`,
          dependsOn: [submitOperation.id],
        });
        if (shouldSendWhatsapp) {
          await enqueueOfflineOperation({
            label: `Enviar WhatsApp ${autosaveDraftId.slice(0, 8)}`,
            path: `/documents/${autosaveDraftId}/customer-messages/draft`,
            dependsOn: [submitOperation.id],
          });
        }

        resetGenerateForm();
        setSubmitResult(
          'Solicitud guardada en este dispositivo. Se sincronizará automáticamente al recuperar la conexión.',
        );
        setItemsModalOpen(false);
        setWorksites([]);
        return;
      }

      let created: { id: string; consecutive?: string | null };
      if (autosaveDraftId) {
        const saved = await api<{ id: string; consecutive: string | null }>(`/documents/${autosaveDraftId}/request/autosave`, {
          method: 'PATCH',
          json: {
            ...autosavePayload,
            ...documentPayload,
            sendWhatsapp: undefined,
            items: movementItems,
          },
        });
        setConsecutive(saved.consecutive ?? '');
        setSavedConsecutive(saved.consecutive);
        created = await api<{ id: string }>(
          `/documents/${autosaveDraftId}/request/submit`,
          {
            method: 'POST',
            json: { sendWhatsapp: shouldSendWhatsapp, ...(tabletEmployeeToken ? { tabletEmployeeToken } : {}) },
          },
        );
      } else {
        created = await api<{ id: string; consecutive?: string | null }>(
          editingRequestId
            ? `/documents/${editingRequestId}/request`
            : '/documents/requests',
          {
            method: editingRequestId ? 'PATCH' : 'POST',
            json: {
              ...documentPayload,
              items: movementItems,
            },
          },
        );
        if (created.consecutive !== undefined) {
          setConsecutive(created.consecutive ?? '');
          setSavedConsecutive(created.consecutive);
        }
      }
      const successMessage = editingRequestId
        ? `Solicitud actualizada (${created.id}).`
        : `Solicitud enviada como borrador (${created.id}).`;
      try {
        await Promise.all([
          uploadEvidencePhotos(created.id),
          uploadProviderRemissionDocuments(
            created.id,
            creationProviderRequirements?.providers ?? [],
          ),
        ]);
        if (!editingRequestId) {
          await api(`/documents/${created.id}/customer-email/draft`, {
            method: 'POST',
          });
          if (shouldSendWhatsapp) {
            await api(`/documents/${created.id}/customer-messages/draft`, {
              method: 'POST',
            });
          }
        }
      } catch (uploadError) {
        const message = formatTransportError(
          uploadError,
          'No se pudieron subir los archivos.',
        );
        throw new Error(
          `La solicitud se guardó (${created.id}), pero fallaron los archivos: ${message}`,
        );
      }
      resetGenerateForm();
      setSubmitResult(successMessage);
      setItemsModalOpen(false);
      setWorksites([]);
      setActiveTab(fixedTab);
      await loadRequests();
      if (mode === 'generate') {
        router.push('/transport/requests');
      }
      router.refresh();
      void syncOfflineOperations();
    } catch (err) {
      setError(formatTransportError(err, 'No se pudo enviar la solicitud.'));
    } finally {
      setSubmitting(false);
    }
  };
  return { handleSubmit };
}
