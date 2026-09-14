import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { OFFICE_VIEWS, validateOfficeQuery } from './query-policy';
import { scopeOfficeQuery, type OfficeOwnerScope } from './owner-scope';

export type OfficeEvidence = {
  id: string;
  title: string;
  views: string[];
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  queriedAt: string;
};

@Injectable()
export class OfficeDatabaseService implements OnModuleDestroy {
  private pool?: Pool;

  private getPool() {
    const url = process.env.OFFICE_ASSISTANT_DATABASE_URL;
    if (!url || new URL(url).username !== 'rev_office_reader') {
      throw new ServiceUnavailableException('Falta configurar la conexión de solo lectura del asistente.');
    }
    // Intentionally never falls back to the application's DATABASE_URL.
    if (!this.pool) {
      this.pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000, application_name: 'rev-office-assistant',
        options: '-c default_transaction_read_only=on -c statement_timeout=5000 -c search_path=pg_catalog,rev_office' });
      this.pool.on('error', () => { /* Do not log connection strings or query data. */ });
    }
    return this.pool;
  }

  private async read<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL search_path = pg_catalog, rev_office");
      await client.query("SET LOCAL TIME ZONE 'America/Bogota'");
      const check = await client.query(`SELECT
        current_user = 'rev_office_reader' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('public', 'rev_office') AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
          AND (has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
            OR has_any_column_privilege(c.oid, 'INSERT,UPDATE'))
        ) AND current_setting('transaction_read_only') = 'on' AS safe
        FROM pg_roles r WHERE rolname = current_user`);
      if (!check.rows[0]?.safe) throw new ServiceUnavailableException('El usuario del asistente tiene permisos incompatibles con solo lectura.');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async schema() {
    return this.read(async (client) => {
      const { rows } = await client.query<{ table_name: string; column_name: string; data_type: string }>(`
        SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'rev_office' AND table_name = ANY($1)
        ORDER BY table_name, ordinal_position`, [[...OFFICE_VIEWS]]);
      if (new Set(rows.map((r) => r.table_name)).size !== OFFICE_VIEWS.length) {
        throw new ServiceUnavailableException('Faltan vistas del asistente. Ejecute su configuración de lectura.');
      }
      return OFFICE_VIEWS.map((view) => `rev_office.${view} (${rows.filter((r) => r.table_name === view)
        .map((r) => `${r.column_name}: ${r.data_type}`).join(', ')})`).join('\n');
    });
  }

  async query(sql: string, title: string, id: string, ownerScope?: OfficeOwnerScope): Promise<OfficeEvidence> {
    const validated = validateOfficeQuery(scopeOfficeQuery(sql, ownerScope));
    return this.read(async (client) => {
      const result = await client.query(`SELECT * FROM (${validated.sql}) AS office_result LIMIT 201`);
      const columns = result.fields.map((f) => f.name);
      if (columns.length > 24 || new Set(columns).size !== columns.length) {
        throw new Error('Selecciona como máximo 24 columnas, con alias únicos.');
      }
      let truncated = result.rows.length > 200;
      let bytes = 0;
      const rows: Record<string, unknown>[] = [];
      for (const raw of result.rows.slice(0, 200)) {
        const row = Object.fromEntries(Object.entries(raw).map(([key, rawValue]) => {
          const field = result.fields.find((f) => f.name === key);
          // Keep arbitrary precision, but avoid displaying 30 meaningless zero decimals.
          const value = field?.dataTypeID === 1700 && typeof rawValue === 'string' && rawValue.includes('.')
            ? rawValue.replace(/0+$/, '').replace(/\.$/, '') : rawValue;
          if (typeof value === 'string' && value.length > 500) {
            truncated = true;
            return [key, `${value.slice(0, 500)}…`];
          }
          return [key, value];
        }));
        bytes += Buffer.byteLength(JSON.stringify(row));
        if (bytes > 64000) { truncated = true; break; }
        rows.push(row);
      }
      return { id, title, views: validated.views, columns, rows,
        rowCount: rows.length, truncated, queriedAt: new Date().toISOString() };
    });
  }

  async onModuleDestroy() { await this.pool?.end(); }
}
