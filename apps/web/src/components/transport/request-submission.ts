export type RequestSubmissionItem = {
  type: 'bulk' | 'serial' | 'free';
  name: string;
  availableQuantity?: number;
  isDamaged?: boolean;
  damageDescription?: string;
  ownerWarehouseId?: string | null;
};

export type RequestSubmissionInput = {
  docType: 'REMISSION' | 'RETURN';
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  docDate: string;
  customerId: string | null;
  customerWorksiteId: string;
  selectedItems: RequestSubmissionItem[];
  shouldSendWhatsapp: boolean;
  recipientPhoneDraft: string;
  recipientPhones: string[];
  editingRequestId: string | null;
  receivedSignature: string | null;
  effectiveWarehouseId: string | null;
  isDriverRole: boolean;
  driverId: string | null;
};

export function normalizeLocalWhatsappPhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^57\d{10}$/.test(digits)) return digits.slice(2);
  return null;
}

export function validateRequestSubmission(input: RequestSubmissionInput): string | null {
  if (!input.docDate || !input.customerId) return 'Completa los campos requeridos.';
  if (!input.selectedItems.length) return 'Selecciona al menos un item.';
  if (
    input.selectedItems.some(
      (item) =>
        item.type === 'bulk' &&
        item.availableQuantity != null &&
        item.availableQuantity < 0,
    )
  ) {
    return 'Algunos items tienen alertas de inventario negativo. Ajusta stock antes de crear el documento.';
  }
  if (!input.customerWorksiteId) return 'Selecciona la obra.';
  if (
    input.shouldSendWhatsapp &&
    input.recipientPhoneDraft &&
    !normalizeLocalWhatsappPhone(input.recipientPhoneDraft)
  ) {
    return 'El número adicional debe contener exactamente 10 dígitos.';
  }
  if (input.shouldSendWhatsapp && !input.recipientPhones.length) {
    return 'El cliente y la obra no tienen teléfono. Agrega al menos un destinatario de WhatsApp.';
  }
  if (input.shouldSendWhatsapp && input.recipientPhones.length > 10) {
    return 'Puedes enviar el documento a máximo 10 destinatarios de WhatsApp.';
  }
  if (!input.editingRequestId && !input.receivedSignature) {
    return 'Captura la firma del cliente antes de enviar.';
  }
  if (input.docType === 'RETURN' && !input.effectiveWarehouseId) {
    return 'Selecciona la bodega para la devolucion.';
  }
  if (
    input.docType === 'REMISSION' &&
    input.deliveryMode === 'WAREHOUSE' &&
    !input.effectiveWarehouseId
  ) {
    return 'Selecciona la bodega de despacho.';
  }
  if (
    input.docType === 'REMISSION' &&
    input.deliveryMode === 'ON_SITE' &&
    input.isDriverRole &&
    !input.driverId
  ) {
    return 'Tu usuario no esta vinculado a un empleado conductor.';
  }
  if (input.docType === 'RETURN' && !input.driverId) {
    return input.deliveryMode === 'ON_SITE'
      ? 'Selecciona el conductor responsable de recoger la devolución.'
      : 'Selecciona el empleado de REV que recibe la devolución.';
  }
  const damagedWithoutDescription = input.selectedItems.find(
    (item) => item.isDamaged && !item.damageDescription?.trim(),
  );
  if (input.docType === 'RETURN' && damagedWithoutDescription) {
    return `Describe el daño de ${damagedWithoutDescription.name}.`;
  }
  return null;
}
