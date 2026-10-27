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

export type LedgerDateRange = 'all' | '7' | '30' | '90' | 'custom';
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function readLedgerLocation(params: URLSearchParams) {
  const filters = createInitialLedgerFilters();
  for (const key of ['warehouseId', 'customerId', 'customerWorksiteId', 'skuId', 'assetId'] as const) {
    const value = params.get(key) ?? '';
    if (uuid.test(value)) filters[key] = value;
  }
  const movement = params.get('movementType') ?? '';
  if (['OUT', 'IN', 'TRANSIT', 'ON_SITE', 'ADJUST'].includes(movement)) filters.movementType = movement;
  for (const key of ['from', 'to'] as const) {
    const value = params.get(key) ?? '';
    if (value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(new Date(value).getTime())) filters[key] = value;
  }
  const range = params.get('range');
  const dateRange: LedgerDateRange = filters.from || filters.to
    ? range === '7' || range === '30' || range === '90' ? range : 'custom'
    : 'all';
  return { filters, search: (params.get('search') ?? '').slice(0, 200), dateRange };
}

// Only the view state belongs in the URL. Cursors and page size are request-local.
export function buildLedgerLocation(filters: LedgerFilters, search: string, dateRange: LedgerDateRange) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  if (search) params.set('search', search.slice(0, 200));
  if ((filters.from || filters.to) && dateRange !== 'all') params.set('range', dateRange);
  const query = params.toString();
  return `/inventory/ledger${query ? `?${query}` : ''}`;
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
