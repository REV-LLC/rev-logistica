import { parse, toSql } from 'pgsql-ast-parser';
import { validateOfficeQuery } from './query-policy';

export type OfficeOwnerScope = 'INTERNAL' | 'PROVIDER';

// This is a reporting scope, not authorization. All access still uses the
// restricted DB login and the SQL policy. Mixed/unspecified questions stay broad.
export function requestedOwnerScope(question: string): OfficeOwnerScope | undefined {
  const text = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const internal = /\b(?:de rev|propios|nuestros|de renta equipos del valle)\b/.test(text);
  const provider = /\b(?:proveedores|terceros)\b/.test(text);
  if (internal && !provider) return 'INTERNAL';
  return undefined;
}

/** Apply ownership BEFORE aggregates, joins and limits, even if the model
 * omits the predicate. Walk only the original tree, never injected subqueries. */
export function scopeOfficeQuery(sql: string, scope?: OfficeOwnerScope): string {
  const validated = validateOfficeQuery(sql);
  if (!scope) return validated.sql;
  const tree = parse(validated.sql)[0];
  const visit = (value: any): any => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const node = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)])) as any;
    if (node.type !== 'table') return node;
    const view = node.name.name;
    let predicate: string | undefined;
    if (['inventory_balances', 'assets', 'owners', 'warehouses'].includes(view)) {
      predicate = `owner_category = '${scope}'`;
    } else if (view === 'movements') {
      predicate = `owner_warehouse_id IN (SELECT warehouse_id FROM rev_office.warehouses WHERE owner_category = '${scope}')`;
    } else if (view === 'provider_prices') {
      predicate = `owner_id IN (SELECT owner_id FROM rev_office.owners WHERE owner_category = '${scope}')`;
    } else if (['documents', 'document_items'].includes(view)) {
      throw new Error('Esta pregunta exige separar propietarios. Usa inventory_balances, assets o movements; los documentos no identifican por sí solos la propiedad de cada pieza.');
    }
    if (!predicate) return node;
    const { name, ...rest } = node;
    return { ...rest, type: 'statement', alias: name.alias || view,
      statement: parse(`SELECT * FROM rev_office.${view} WHERE ${predicate}`)[0] };
  };
  // Revalidate the complete generated query; the original SQL is never executed.
  return validateOfficeQuery(toSql.statement(visit(tree))).sql;
}
