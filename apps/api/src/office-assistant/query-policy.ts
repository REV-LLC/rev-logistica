import { parse, toSql } from 'pgsql-ast-parser';

export const OFFICE_VIEWS = [
  'catalog', 'owners', 'warehouses', 'customers', 'worksites', 'customer_worksites',
  'assets', 'documents', 'document_items', 'movements', 'inventory_balances', 'provider_prices',
] as const;

const allowedNodes = new Set([
  'select', 'union', 'union all', 'table', 'statement', 'ref', 'call',
  'binary', 'unary', 'integer', 'numeric', 'string', 'boolean', 'null',
  'case', 'cast', 'list', 'extract', 'ternary', 'keyword',
  'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
]);
const allowedFunctions = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'round', 'abs',
  'lower', 'upper', 'trim', 'btrim', 'length', 'date_trunc', 'date_part',
  'now', 'greatest', 'least', 'bool_and', 'bool_or', 'string_agg',
]);
const allowedCasts = new Set([
  'text', 'numeric', 'decimal', 'integer', 'int', 'int4', 'bigint', 'int8',
  'boolean', 'bool', 'date', 'timestamp', 'timestamptz', 'interval', 'float',
  'real', 'double precision', 'varchar',
]);

/** Fail closed on SQL syntax outside the reporting subset. This is in addition
 * to database grants and a read-only transaction, not a substitute for them. */
export function validateOfficeQuery(sql: string): { sql: string; views: string[] } {
  if (!sql.trim() || sql.length > 12000) throw new Error('La consulta está vacía o es demasiado larga.');
  let statements: ReturnType<typeof parse>;
  try { statements = parse(sql); } catch { throw new Error('SQL no reconocido. Usa un SELECT sencillo, sin WITH.'); }
  if (statements.length !== 1 || !['select', 'union', 'union all'].includes(statements[0].type)) {
    throw new Error('Solo se permite una consulta SELECT.');
  }
  const views = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, any>;
    if (node.type && !allowedNodes.has(node.type)) throw new Error(`Operación SQL no permitida: ${node.type}.`);
    if (node.type === 'select' && (node.into || node.for || node.skip || node.with)) {
      throw new Error('No se permiten bloqueos ni escrituras.');
    }
    if (node.type === 'table') {
      if (node.name?.schema !== 'rev_office' || !OFFICE_VIEWS.includes(node.name.name)) {
        throw new Error('Consulta únicamente las vistas autorizadas del esquema rev_office.');
      }
      views.add(node.name.name);
    }
    if (node.type === 'call') {
      if ((node.function.schema && node.function.schema !== 'pg_catalog')
        || !allowedFunctions.has(node.function.name)) {
        throw new Error('Función SQL no permitida. Usa agregaciones y funciones de texto/fecha básicas.');
      }
    }
    if (node.type === 'cast' && (node.to.schema || !allowedCasts.has(node.to.name))) {
      throw new Error('Conversión de tipo no permitida.');
    }
    if (node.type === 'keyword' && !['current_date', 'current_timestamp'].includes(node.keyword)) {
      throw new Error('Expresión SQL no permitida.');
    }
    Object.values(node).forEach(visit);
  };
  visit(statements[0]);
  if (!views.size) throw new Error('La consulta debe leer al menos una vista de Office.');
  // Serialize the validated tree, never run the original untrusted string.
  return { sql: toSql.statement(statements[0]).replace(/;\s*$/, ''), views: [...views] };
}
