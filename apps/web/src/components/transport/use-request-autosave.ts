'use client';
import { buildRequestItems } from '@/components/transport/request-items';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { buildRequestNotes } from './request-formatting';
import type { Warehouse } from './request-types';
import { SelectedItem } from './request-types';

type Options = {
  docType: 'REMISSION' | 'RETURN';
  documentNumber: string | undefined;
  setConsecutive: Dispatch<SetStateAction<string>>;
  setSavedConsecutive: Dispatch<SetStateAction<string | null>>;
  warehouseId: string | null;
  principalWarehouse: Warehouse | null;
  customerWorksiteId: string;
  observations: string;
  documentTimestamp: string | null;
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  vehicleId: string | null;
  driverId: string | null;
  dispatcherId: string | null;
  shouldSendWhatsapp: boolean;
  whatsappRecipientPhones: string[];
  receivedSignature: string | null;
  selectedItems: SelectedItem[];
  autosaveDraftId: string | null;
  autosaveReady: boolean;
  editingRequestId: string | null;
  submitting: boolean;
};

export function useRequestAutosave({
  docType,
  documentNumber,
  setConsecutive,
  setSavedConsecutive,
  warehouseId,
  principalWarehouse,
  customerWorksiteId,
  observations,
  documentTimestamp,
  deliveryMode,
  vehicleId,
  driverId,
  dispatcherId,
  shouldSendWhatsapp,
  whatsappRecipientPhones,
  receivedSignature,
  selectedItems,
  autosaveDraftId,
  autosaveReady,
  editingRequestId,
  submitting,
}: Options) {
  const [autosaveStatus, setAutosaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'offline' | 'error'
  >('idle');

  const autosavePayload = useMemo(
    () => ({
      type: docType,
      number: documentNumber,
      warehouseId: warehouseId ?? principalWarehouse?.id ?? undefined,
      customerWorksiteId: customerWorksiteId || undefined,
      notes: buildRequestNotes({
        observations,
        documentTimestamp,
        docType,
        deliveryMode,
        vehicleId,
        driverId,
        dispatcherId,
      }),
      recipientPhones: shouldSendWhatsapp ? whatsappRecipientPhones : [],
      receivedSignature: receivedSignature ?? '',
      items: buildRequestItems(selectedItems),
    }),
    [
      documentNumber,
      customerWorksiteId,
      deliveryMode,
      dispatcherId,
      documentTimestamp,
      docType,
      driverId,
      observations,
      principalWarehouse?.id,
      receivedSignature,
      selectedItems,
      shouldSendWhatsapp,
      vehicleId,
      warehouseId,
      whatsappRecipientPhones,
    ],
  );

  useEffect(() => {
    if (!autosaveDraftId || !autosaveReady || editingRequestId || submitting || !documentTimestamp)
      return;
    if (!navigator.onLine) {
      setAutosaveStatus('offline');
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      setAutosaveStatus('saving');
      try {
        const saved = await api<{ id: string; consecutive: string | null }>(`/documents/${autosaveDraftId}/request/autosave`, {
          method: 'PATCH',
          json: autosavePayload,
        });
        if (active && saved.id === autosaveDraftId) {
          setConsecutive(saved.consecutive ?? '');
          setSavedConsecutive(saved.consecutive);
          setAutosaveStatus('saved');
        }
      } catch {
        if (active) setAutosaveStatus('error');
      }
    }, 900);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    autosaveDraftId,
    autosavePayload,
    autosaveReady,
    documentTimestamp,
    setConsecutive,
    setSavedConsecutive,
    editingRequestId,
    submitting,
  ]);
  return { autosaveStatus, setAutosaveStatus, autosavePayload };
}
