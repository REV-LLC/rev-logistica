export type LedgerFilters = {
  warehouseId: string;
  customerId: string;
  customerWorksiteId: string;
  movementType: string;
  skuId: string;
  assetId: string;
  from: string;
  to: string;
};

export type LedgerWorksiteOption = {
  id: string;
  alias: string | null;
  customer: { id: string; name: string };
  worksite: { id: string; name: string };
};

export function createInitialLedgerFilters(): LedgerFilters {
  return { warehouseId: '', customerId: '', customerWorksiteId: '', movementType: '', skuId: '', assetId: '', from: '', to: '' };
}

export function buildLedgerQuery(filters: LedgerFilters, search: string, cursor?: string | null) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('take', '30');
  if (search.trim()) params.set('search', search.trim());
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function ledgerCustomerOptions(worksites: LedgerWorksiteOption[]) {
  return [...new Map(worksites.map(row => [row.customer.id, { value: row.customer.id, label: row.customer.name }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function ledgerWorksiteOptions(worksites: LedgerWorksiteOption[], customerId: string) {
  return worksites.filter(row => !customerId || row.customer.id === customerId).map(row => ({
    value: row.id,
    label: [row.worksite.name, row.alias && row.alias !== row.worksite.name ? row.alias : '', !customerId ? row.customer.name : ''].filter(Boolean).join(' · '),
  })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
