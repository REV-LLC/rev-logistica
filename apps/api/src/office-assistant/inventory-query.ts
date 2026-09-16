import { z } from 'zod';

export const inventoryParameters = z.object({
  terms: z.array(z.string().trim().min(1).max(60)).max(4)
    .describe('Raíces del artículo, familia o subfamilia; todas deben coincidir. Ejemplo: ["tornill", "nivel"]. Vacío para todos.'),
  location: z.enum(['ALL', 'WORKSITE', 'WAREHOUSE']),
  ownership: z.enum(['ALL', 'INTERNAL', 'PROVIDER']),
  groupBy: z.enum(['LOCATION', 'ITEM', 'CUSTOMER', 'OWNER', 'ASSET'])
    .describe('LOCATION para dónde están/cuáles obras; ITEM para cantidades; ASSET para códigos y seriales.'),
});

/** Fixed query plans: never interpolate identifiers or accept SQL in filters. */
export function inventoryQuery(input: z.infer<typeof inventoryParameters>) {
  const { terms, location, ownership, groupBy } = inventoryParameters.parse(input);
  const where: string[] = [];
  for (const term of terms) {
    // Backslash and wildcard syntax are not part of the natural-language search contract.
    if (/[\\%_\u0000-\u001f]/.test(term)) throw new Error('Usa raíces de nombres sin comodines ni caracteres de control.');
    const literal = `'%${term.replace(/'/g, "''")}%'`;
    where.push(`(item_name ILIKE ${literal} OR family_name ILIKE ${literal} OR subfamily_name ILIKE ${literal})`);
  }
  if (location !== 'ALL') where.push(`location_type = '${location}'`);
  if (ownership !== 'ALL') where.push(`owner_category = '${ownership}'`);
  const fields: [string, string][] = [
    ['item_name', 'articulo'], ['size', 'tamano'], ['control_type', 'control'],
    ['owner_name', 'propietario'], ['owner_category', 'propiedad'], ['location_type', 'tipo_ubicacion'],
    ['active', 'activo'], ['balance_valid', 'saldo_valido'],
  ];
  const groupIds = ['sku_id', 'owner_id'];
  if (groupBy === 'LOCATION' || groupBy === 'ASSET') {
    fields.push(['location_name', 'ubicacion'], ['worksite_name', 'obra'], ['customer_name', 'cliente']);
    groupIds.push('location_id', 'worksite_id', 'customer_id');
  } else if (groupBy === 'CUSTOMER') {
    fields.push(['customer_name', 'cliente']);
    groupIds.push('customer_id');
  }
  if (groupBy === 'ASSET') {
    fields.push(['public_code', 'codigo'], ['serial_number', 'serial']);
    groupIds.push('asset_id');
  }
  // Keep invalid/inactive balances separate, not silently subtracted from usable units.
  return `SELECT ${fields.map(([field, alias]) => `${field} AS ${alias}`).join(', ')},
    SUM(quantity) AS cantidad
    FROM rev_office.inventory_balances
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY ${[...groupIds, ...fields.map(([field]) => field)].join(', ')}
    ORDER BY item_name, size, owner_name, location_type${groupBy === 'LOCATION' || groupBy === 'ASSET' ? ', location_name' : ''}`;
}
