export type DocumentPrintRow = {
  id?: string;
  assetId?: string | null;
  accessoryId?: string | null;
  accessoryName?: string | null;
  accessoryCode?: string | null;
  quantity?: string | number | null;
  condition?: string | null;
  conditionNote?: string | null;
  requestedTag?: string | null;
  sku?: { name: string } | null;
  asset?: { description?: string | null; internalNumber?: number | null; sku?: { name: string } | null } | null;
  ownerWarehouse?: { name: string; ownerCompany?: { name: string } | null } | null;
};

// Legacy ledger rows preserve resolved ownership. Accessories have their own
// physical ledger, so a confirmed document's StockLedger cannot represent them.
export function documentPrintRows(document: {
  type: string;
  items: DocumentPrintRow[];
  ledger: DocumentPrintRow[];
}) {
  if (document.type === 'RETURN' || !document.ledger.length) return document.items;
  return [...document.ledger, ...document.items.filter(item => item.accessoryId)];
}

export function documentItemDescription(item: DocumentPrintRow) {
  if (item.accessoryId) return item.accessoryName || item.requestedTag || 'Accesorio';
  return item.asset?.description || item.asset?.sku?.name || item.sku?.name || item.requestedTag || '-';
}

export function documentItemCode(item: DocumentPrintRow) {
  return item.accessoryCode || (item.asset?.internalNumber != null ? `#${item.asset.internalNumber}` : '');
}
