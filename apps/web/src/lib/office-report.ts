export type OfficeEvidence = {
  id: string; title: string; views: string[]; columns: string[];
  columnTypes?: Record<string, 'number' | 'date' | 'datetime' | 'text' | 'boolean'>;
  rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; queriedAt: string;
};
export type OfficeReply = {
  answer: string; evidence: OfficeEvidence[]; queriedAt: string; readOnly: boolean;
  usage?: { requests: number; inputTokens: number; outputTokens: number };
};

const labels: Record<string, string> = {
  sku_id: 'ID de referencia', item_name: 'Artículo', family_name: 'Familia', family_code: 'Código de familia',
  control_type: 'Tipo de control', subfamily_name: 'Subfamilia', size: 'Tamaño', tamano: 'Tamaño', articulo: 'Artículo',
  price: 'Tarifa', subrental_price: 'Tarifa de subalquiler', replacement_value: 'Valor de reposición',
  charge_type: 'Tipo de cobro', minimum_charge_hours: 'Horas mínimas de cobro', unit_weight: 'Peso unitario',
  length_meters: 'Longitud (m)', area_m2: 'Área (m²)', active: 'Activo', item_active: 'Artículo activo',
  owner_id: 'ID de propietario', owner_name: 'Propietario', owner_category: 'Tipo de propietario',
  identification: 'Identificación', phone: 'Teléfono', email: 'Correo electrónico',
  warehouse_id: 'ID de bodega', warehouse_name: 'Bodega', warehouse_type: 'Tipo de bodega',
  customer_id: 'ID de cliente', customer_name: 'Cliente', worksite_id: 'ID de obra', worksite_name: 'Obra',
  customer_worksite_id: 'ID de relación cliente-obra', location_type: 'Tipo de ubicación',
  location_id: 'ID de ubicación', location_name: 'Ubicación', tipo_ubicacion: 'Tipo de ubicación', ubicacion: 'Ubicación',
  quantity: 'Cantidad', qty: 'Cantidad', total_quantity: 'Cantidad total', total: 'Total', count: 'Conteo',
  asset_id: 'ID de activo', public_code: 'Código de equipo', codigo: 'Código', serial_number: 'Número de serie',
  internal_number: 'Número interno', registration_number: 'Matrícula', brand: 'Marca', model: 'Modelo', year: 'Año',
  description: 'Descripción', hourmeter: 'Horómetro', deleted_at: 'Fecha de eliminación', kind: 'Clase',
  assigned_motor: 'Motor asignado', last_movement_type: 'Último movimiento', last_movement_at: 'Fecha del último movimiento',
  owner_warehouse_id: 'ID de bodega propietaria', owner_warehouse_name: 'Bodega propietaria',
  current_warehouse_id: 'ID de bodega actual', current_warehouse_name: 'Bodega actual',
  balance_valid: 'Saldo válido', saldo_valido: 'Saldo válido',
  movement_id: 'ID de movimiento', movement_type: 'Tipo de movimiento', worksite_delta: 'Variación en obra',
  effective_at: 'Fecha efectiva', recorded_at: 'Fecha de registro', is_opening_balance: 'Saldo inicial',
  document_id: 'ID de documento', document_type: 'Tipo de documento', document_number: 'Número de documento',
  document_item_id: 'ID de línea', status: 'Estado', created_at: 'Fecha de creación', updated_at: 'Fecha de actualización',
  provider_warehouse_id: 'ID de bodega proveedora', provider_warehouse_name: 'Bodega proveedora',
  address: 'Dirección', city: 'Ciudad', alias: 'Alias', notes: 'Observaciones', name: 'Nombre',
  billing_address: 'Dirección de facturación', external_code: 'Código externo', contact_name: 'Contacto',
  hour_meter: 'Horómetro', assigned_motor_id: 'ID de motor asignado', consecutive: 'Consecutivo',
  document_date: 'Fecha del documento', billing_status: 'Estado de facturación', billing_cutoff_date: 'Fecha de corte de cobro',
  returned_at: 'Fecha de devolución', damage_cost_estimate: 'Costo estimado de daños', component_parent_asset_id: 'ID del equipo principal',
};
const enums: Record<string, Record<string, string>> = {
  location_type: { WORKSITE: 'En obra', WAREHOUSE: 'En bodega' },
  owner_category: { INTERNAL: 'Propiedad de REV', PROVIDER: 'Propiedad de proveedor' },
  control_type: { BULK: 'Por cantidad', SERIAL: 'Serializado' },
  warehouse_type: { OWN: 'Propia', ALLY: 'Aliada' },
  movement_type: { OUT: 'Salida', IN: 'Entrada', ON_SITE: 'Ingreso en obra', TRANSIT: 'Tránsito', ADJUSTMENT: 'Ajuste' },
  status: { DRAFT: 'Borrador', IN_PROGRESS: 'En proceso', CONFIRMED: 'Confirmado', COMPLETED: 'Completado', CANCELLED: 'Anulado', CLOSED: 'Cerrado', OPEN: 'Abierto', FAILED: 'Fallido', VOID: 'Anulado' },
  charge_type: { DAY: 'Por día', HOUR: 'Por hora' },
  kind: { STANDARD: 'Estándar', MOTOR: 'Motor' },
  billing_status: { OPEN: 'Abierto', CUT: 'Corte de cobro', CLOSED: 'Cerrado' },
  document_type: { DELIVERY: 'Entrega', PICKUP: 'Recogida', RECEIPT: 'Recepción', REMISSION: 'Remisión', RETURN: 'Devolución', ADJUSTMENT: 'Ajuste', CUTOVER: 'Corte inicial', PROVIDER_RECEIPT: 'Recepción de proveedor', PROVIDER_PICKUP: 'Recogida de proveedor' },
};
const enumAliases: Record<string, string> = { tipo_ubicacion: 'location_type', propiedad: 'owner_category',
  control: 'control_type', tipo_control: 'control_type', tipo_bodega: 'warehouse_type',
  last_movement_type: 'movement_type', tipo_movimiento: 'movement_type', estado: 'status',
  tipo_cobro: 'charge_type', tipo_documento: 'document_type', estado_facturacion: 'billing_status' };

export function columnLabel(column: string) {
  const key = column.toLowerCase();
  if (Object.hasOwn(labels, key)) return labels[key];
  const text = column.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function translatedValue(column: string, value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const key = column.toLowerCase();
  const mapping = enums[enumAliases[key] ?? key];
  return typeof value === 'string' && mapping && Object.hasOwn(mapping, value) ? mapping[value] : value;
}

export function displayOfficeValue(column: string, value: unknown, type?: string): string {
  if (value === null || value === undefined) return '—';
  const translated = translatedValue(column, value);
  if (type === 'date' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (type === 'datetime' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  }
  return typeof translated === 'object' ? JSON.stringify(translated) : String(translated);
}

/** Excel preserves 15 significant digits. Keep longer decimals/identifiers as text. */
export function officeExcelValue(column: string, value: unknown, type?: string): string | number | Date | null {
  if (value === null || value === undefined) return null;
  const translated = translatedValue(column, value);
  if (type === 'number' && (typeof value === 'string' || typeof value === 'number')) {
    const raw = String(value);
    const significantDigits = raw.replace(/^[+-]?0*/, '').replace(/[^0-9]/g, '').length;
    if (/^-?\d+(\.\d+)?$/.test(raw) && significantDigits <= 15 && Number.isFinite(Number(value))) return Number(value);
  }
  if (type === 'date' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value);
  }
  if (type === 'datetime' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    // XLSX dates carry no timezone: store Colombia wall time, labeled in the sheet.
    return new Date(Date.parse(value) - 5 * 60 * 60 * 1000);
  }
  // Never pass untrusted objects as ExcelJS cell values (formula/hyperlink objects execute).
  return typeof translated === 'object' ? JSON.stringify(translated) : String(translated);
}
