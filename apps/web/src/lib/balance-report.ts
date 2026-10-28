export type BalanceReportKind =
  | 'general'
  | 'worksites'
  | 'customers'
  | 'providers'
  | 'warehouses';
export type BalanceOwnership = 'ALL' | 'INTERNAL' | 'PROVIDER';
export type BalanceReportQuery = {
  report: BalanceReportKind;
  customerId?: string;
  customerWorksiteId?: string;
  providerId?: string;
  warehouseId?: string;
  ownership?: BalanceOwnership;
};
export type BalanceReportRow = {
  itemKey: string;
  reference: string;
  identification: string;
  controlType: 'BULK' | 'SERIAL';
  isImplement: boolean;
  ownerId: string | null;
  ownerName: string;
  ownerCategory: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName: string;
  locationType: 'WAREHOUSE' | 'WORKSITE' | 'TRANSIT' | 'UNKNOWN';
  locationId: string | null;
  locationName: string;
  customerId: string | null;
  customerName: string;
  worksiteName: string;
  worksiteAlias: string;
  quantity: number;
  source: 'INVENTORY' | 'LEGACY_IMPLEMENT';
};
export type BalanceReport = {
  report: BalanceReportKind;
  title: string;
  queriedAt: string;
  filters: {
    customer: string | null;
    worksite: string | null;
    provider: string | null;
    warehouse: string | null;
    ownership: BalanceOwnership;
  };
  scope: string;
  warnings: string[];
  rowCount: number;
  rows: BalanceReportRow[];
};
export type BalanceReportOptions = {
  worksites: {
    id: string;
    alias: string | null;
    active: boolean;
    customer: { id: string; name: string };
    worksite: { name: string };
  }[];
  warehouses: {
    id: string;
    name: string;
    type: 'OWN' | 'ALLY';
    active: boolean;
    ownerCompany: { id: string; name: string; category: string };
  }[];
};
export const balanceReportKinds = [
  { value: 'general', label: 'Saldo general' },
  { value: 'worksites', label: 'Saldos en obra por cliente' },
  { value: 'customers', label: 'Saldos por cliente' },
  { value: 'providers', label: 'Saldos de proveedores' },
  { value: 'warehouses', label: 'Saldos de bodega' },
] satisfies { value: BalanceReportKind; label: string }[];

export function balanceReportPath(query: BalanceReportQuery) {
  const params = new URLSearchParams({ report: query.report });
  if (query.report === 'worksites' || query.report === 'customers') {
    if (query.customerId) params.set('customerId', query.customerId);
    if (query.customerWorksiteId)
      params.set('customerWorksiteId', query.customerWorksiteId);
  }
  if (query.report === 'providers' && query.providerId)
    params.set('providerId', query.providerId);
  if (query.report === 'warehouses' && query.warehouseId)
    params.set('warehouseId', query.warehouseId);
  if (
    query.ownership &&
    query.ownership !== 'ALL' &&
    query.report !== 'providers'
  )
    params.set('ownership', query.ownership);
  return `/inventory/reports/balances?${params}`;
}
export function balanceItemLabel(
  row: Pick<BalanceReportRow, 'reference' | 'identification'>,
) {
  return `${row.reference}${row.identification ? ` ${row.identification}` : ''}`;
}
export const balanceLocationLabels = {
  WAREHOUSE: 'En bodega',
  WORKSITE: 'En obra',
  TRANSIT: 'En tránsito',
  UNKNOWN: 'Sin confirmar',
};

/** Group by immutable identities, never by display names or reference text. */
export function summarizeBalances(report: BalanceReport) {
  const groups = new Map<
    string,
    {
      customer: string;
      worksite: string;
      alias: string;
      warehouse: string;
      reference: string;
      type: string;
      owner: string;
      ownerWarehouse: string;
      warehouseQuantity: number;
      worksiteQuantity: number;
      transitQuantity: number;
      unknownQuantity: number;
      quantity: number;
    }
  >();
  for (const row of report.rows) {
    const key = JSON.stringify([
      row.itemKey,
      row.ownerWarehouseId,
      ['customers', 'worksites'].includes(report.report)
        ? row.customerId
        : null,
      ['worksites', 'warehouses'].includes(report.report)
        ? row.locationId
        : null,
    ]);
    const group = groups.get(key) ?? {
      customer: row.customerName,
      worksite: row.worksiteName,
      alias: row.worksiteAlias,
      warehouse: row.locationName,
      reference: balanceItemLabel(row),
      type: row.controlType === 'BULK' ? 'Por cantidad' : 'Equipo',
      owner: row.ownerName,
      ownerWarehouse: row.ownerWarehouseName,
      warehouseQuantity: 0,
      worksiteQuantity: 0,
      transitQuantity: 0,
      unknownQuantity: 0,
      quantity: 0,
    };
    if (row.locationType === 'WAREHOUSE')
      group.warehouseQuantity += row.quantity;
    if (row.locationType === 'WORKSITE') group.worksiteQuantity += row.quantity;
    if (row.locationType === 'TRANSIT') group.transitQuantity += row.quantity;
    if (row.locationType === 'UNKNOWN') group.unknownQuantity += row.quantity;
    group.quantity += row.quantity;
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function balanceReportFileName(report: BalanceReport) {
  const scope =
    report.filters.worksite ||
    report.filters.customer ||
    report.filters.provider ||
    report.filters.warehouse ||
    'todos';
  const slug = scope
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(report.queriedAt));
  return `REV-saldos-${report.report}-${slug || 'todos'}-${date}.xlsx`;
}
