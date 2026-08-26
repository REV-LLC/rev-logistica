type RequestDocumentItem = {
  skuId?: string | null;
  assetId?: string | null;
  componentParentAssetId?: string | null;
  quantity?: string | number | null;
  condition?: string | null;
  conditionNote?: string | null;
  requestedTag?: string | null;
  sku?: { name: string } | null;
  asset?: {
    description?: string | null;
    serialOrEngine?: string | null;
    assignedToMixer?: { id: string } | null;
    sku?: { name: string } | null;
  } | null;
};

export type RequestDocumentForForm = {
  id: string;
  type: string;
  consecutive?: string | null;
  docDate?: string | null;
  notes?: string | null;
  recipientPhone?: string | null;
  recipientPhones?: string[];
  warehouse?: { id: string } | null;
  customerWorksite?: {
    id: string;
    customer?: { id: string } | null;
  } | null;
  files?: Array<{ fileType: string; storageKey: string }>;
  items: RequestDocumentItem[];
};

export type MappedSelectedItem = {
  selectionId: string;
  type: 'bulk' | 'serial' | 'free';
  bulkKey?: string;
  skuId?: string;
  assetId?: string;
  name: string;
  requestedTag?: string;
  serial?: string | null;
  quantity?: number;
  ownerWarehouseId?: string | null;
  isDamaged?: boolean;
  damageDescription?: string;
  associatedMixerId?: string;
  componentParentAssetId?: string;
};

const SYSTEM_NOTE_KEYS = new Set([
  'fecha documento',
  'fecha doc',
  'fecha corte',
  'document date',
  'cutoff date',
  'entrega',
  'vehicle',
  'vehiculo',
  'conductor',
  'driver',
  'recibe',
  'dispatcher',
  'despachador',
]);

export function buildBulkKey(item: { skuId: string; ownerWarehouseId: string | null }) {
  return `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;
}

export function parseRequestNotes(notes: string | null) {
  if (!notes) return {};
  const map = new Map<string, string>();
  notes.split('|').forEach((value) => {
    const [key, ...rest] = value.trim().split(':');
    if (key && rest.length) map.set(key.trim().toLowerCase(), rest.join(':').trim());
  });
  return {
    deliveryMode: map.get('entrega') ?? '',
    vehicleId: map.get('vehículo') ?? map.get('vehiculo') ?? '',
    driverId: map.get('conductor') ?? '',
    receiverId: map.get('recibe') ?? '',
    dispatcherId: map.get('despachador') ?? '',
  };
}

function normalizeNoteKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function extractUserObservations(notes: string | null) {
  if (!notes) return '';
  return notes
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex < 0) return true;
      return !SYSTEM_NOTE_KEYS.has(normalizeNoteKey(part.slice(0, separatorIndex)));
    })
    .join(' | ');
}

function mapRequestItem(
  item: RequestDocumentItem,
  createSelectionId: () => string,
): MappedSelectedItem {
  const ownerWarehouseId = item.condition ?? null;
  const damageDescription = item.conditionNote ?? '';
  const condition = {
    ownerWarehouseId,
    isDamaged: Boolean(item.conditionNote?.trim()),
    damageDescription,
  };

  if (!item.skuId && !item.assetId && item.requestedTag) {
    return {
      selectionId: createSelectionId(),
      type: 'free',
      name: item.requestedTag,
      requestedTag: item.requestedTag,
      quantity: Number(item.quantity ?? 1) || 1,
      componentParentAssetId: item.componentParentAssetId ?? undefined,
      ...condition,
    };
  }
  if (item.skuId) {
    return {
      selectionId: createSelectionId(),
      type: 'bulk',
      bulkKey: buildBulkKey({ skuId: item.skuId, ownerWarehouseId }),
      skuId: item.skuId,
      name: item.sku?.name ?? item.skuId,
      quantity: Number(item.quantity ?? 1) || 1,
      ...condition,
    };
  }
  return {
    selectionId: createSelectionId(),
    type: 'serial',
    assetId: item.assetId ?? undefined,
    name:
      item.asset?.description ??
      item.asset?.sku?.name ??
      item.asset?.serialOrEngine ??
      item.assetId ??
      'Serial',
    serial: item.asset?.serialOrEngine ?? null,
    associatedMixerId: item.asset?.assignedToMixer?.id,
    componentParentAssetId: item.componentParentAssetId ?? undefined,
    ...condition,
  };
}

export function mapDocumentToRequestForm(
  document: RequestDocumentForForm,
  dependencies: {
    createSelectionId: () => string;
    normalizePhone: (phone?: string | null) => string | null;
  },
) {
  const parsedNotes = parseRequestNotes(document.notes ?? null);
  const rawPhones = document.recipientPhones?.length
    ? document.recipientPhones
    : document.recipientPhone
      ? [document.recipientPhone]
      : [];
  const documentDate = document.docDate ? new Date(document.docDate) : null;

  return {
    docType: document.type === 'RETURN' ? ('RETURN' as const) : ('REMISSION' as const),
    consecutive: document.consecutive ?? '',
    customerId: document.customerWorksite?.customer?.id ?? null,
    additionalRecipientPhones: rawPhones
      .map(dependencies.normalizePhone)
      .filter((phone): phone is string => Boolean(phone)),
    docDate:
      documentDate && !Number.isNaN(documentDate.getTime())
        ? documentDate.toISOString().slice(0, 10)
        : '',
    deliveryMode:
      parsedNotes.deliveryMode === 'ON_SITE'
        ? ('ON_SITE' as const)
        : ('WAREHOUSE' as const),
    customerWorksiteId: document.customerWorksite?.id ?? '',
    warehouseId: document.warehouse?.id ?? null,
    observations: extractUserObservations(document.notes ?? null),
    vehicleId: parsedNotes.vehicleId ?? null,
    driverId: parsedNotes.receiverId || parsedNotes.driverId || null,
    dispatcherId: parsedNotes.dispatcherId ?? null,
    selectedItems: document.items.map((item) =>
      mapRequestItem(item, dependencies.createSelectionId),
    ),
    receivedSignature:
      document.files?.find((file) => file.fileType === 'SIGNATURE_RECEIVED')?.storageKey ??
      null,
  };
}
