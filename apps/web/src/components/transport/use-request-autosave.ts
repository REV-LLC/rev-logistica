'use client';
import { buildRequestItems } from '@/components/transport/request-items';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { buildRequestNotes, withDocPrefix } from './request-formatting';
import type { Warehouse } from './request-types';
import { SelectedItem } from './request-types';

type Options = {
  docType: 'REMISSION' | 'RETURN';
  consecutive: string;
  warehouseId: string | null;
  principalWarehouse: Warehouse | null;
  customerWorksiteId: string;
  observations: string;
  docDate: string;
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
  consecutive,
  warehouseId,
  principalWarehouse,
  customerWorksiteId,
  observations,
  docDate,
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
      number: consecutive ? withDocPrefix(consecutive, docType) : undefined,
      warehouseId: warehouseId ?? principalWarehouse?.id ?? undefined,
      customerWorksiteId: customerWorksiteId || undefined,
      notes: buildRequestNotes({
        observations,
        docDate,
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
      consecutive,
      customerWorksiteId,
      deliveryMode,
      dispatcherId,
      docDate,
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
    if (!autosaveDraftId || !autosaveReady || editingRequestId || submitting)
      return;
    if (!navigator.onLine) {
      setAutosaveStatus('offline');
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      setAutosaveStatus('saving');
      try {
        await api(`/documents/${autosaveDraftId}/request/autosave`, {
          method: 'PATCH',
          json: autosavePayload,
        });
        if (active) setAutosaveStatus('saved');
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
    editingRequestId,
    submitting,
  ]);
  return { autosaveStatus, setAutosaveStatus, autosavePayload };
}
