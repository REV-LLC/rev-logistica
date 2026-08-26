type DocumentType = 'REMISSION' | 'RETURN';
type DeliveryMode = 'WAREHOUSE' | 'ON_SITE';

export type RequestPayloadSource = {
  docType: DocumentType;
  consecutive: string;
  warehouseId: string | null;
  customerWorksiteId: string;
  observations: string;
  docDate: string;
  deliveryMode: DeliveryMode;
  vehicleId: string | null;
  driverId: string | null;
  dispatcherId: string | null;
  recipientPhones: string[];
  receivedSignature: string | null;
  items: Array<Record<string, unknown>>;
};

export function withDocPrefix(value: string, docType: DocumentType) {
  const prefix = docType === 'REMISSION' ? 'RM' : 'DV';
  const cleaned = value.trim().replace(/^(RM|DV)[\s\-_]*/i, '');
  return `${prefix}${cleaned}`;
}

export function buildRequestNotes({
  observations,
  docDate,
  docType,
  deliveryMode,
  vehicleId,
  driverId,
  dispatcherId,
}: Pick<
  RequestPayloadSource,
  | 'observations'
  | 'docDate'
  | 'docType'
  | 'deliveryMode'
  | 'vehicleId'
  | 'driverId'
  | 'dispatcherId'
>) {
  return [
    observations.trim() || null,
    `Fecha documento: ${docDate}`,
    `Entrega: ${deliveryMode}`,
    deliveryMode === 'ON_SITE' && vehicleId ? `Vehiculo: ${vehicleId}` : null,
    deliveryMode === 'ON_SITE' && driverId ? `Conductor: ${driverId}` : null,
    docType === 'RETURN' && driverId ? `Recibe: ${driverId}` : null,
    docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && dispatcherId
      ? `Despachador: ${dispatcherId}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildSharedPayload(source: RequestPayloadSource) {
  return {
    type: source.docType,
    number: source.consecutive
      ? withDocPrefix(source.consecutive, source.docType)
      : undefined,
    warehouseId: source.warehouseId ?? undefined,
    customerWorksiteId: source.customerWorksiteId || undefined,
    notes: buildRequestNotes(source),
  };
}

export function buildAutosavePayload(source: RequestPayloadSource) {
  return {
    ...buildSharedPayload(source),
    recipientPhones: source.recipientPhones,
    receivedSignature: source.receivedSignature ?? '',
    items: source.items,
  };
}

export function buildDocumentPayload(
  source: RequestPayloadSource,
  context: {
    shouldSendWhatsapp: boolean;
    editingRequestId: string | null;
    isAdminRole: boolean;
  },
) {
  return {
    ...buildSharedPayload(source),
    ...(context.shouldSendWhatsapp ? { recipientPhones: source.recipientPhones } : {}),
    ...(!context.editingRequestId
      ? { sendWhatsapp: context.shouldSendWhatsapp }
      : {}),
    receivedSignature:
      context.editingRequestId && !context.isAdminRole
        ? undefined
        : (source.receivedSignature ?? ''),
  };
}

export function buildDraftPersistencePayload(
  autosavePayload: ReturnType<typeof buildAutosavePayload>,
  documentPayload: ReturnType<typeof buildDocumentPayload>,
) {
  return {
    ...autosavePayload,
    ...documentPayload,
    sendWhatsapp: undefined,
    items: autosavePayload.items,
  };
}
