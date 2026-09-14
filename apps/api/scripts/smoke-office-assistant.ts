import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { OfficeDatabaseService } from '../src/office-assistant/office-database.service';
import { OfficeAssistantService } from '../src/office-assistant/office-assistant.service';

async function main() {
  process.loadEnvFile(resolve(__dirname, '../.env'));
  const database = new OfficeDatabaseService();
  try {
    const schema = await database.schema();
    assert(schema.includes('inventory_balances'));
    const summary = await database.query(`SELECT location_type, control_type, COUNT(*) AS grupos,
      SUM(quantity) AS unidades FROM rev_office.inventory_balances
      WHERE quantity > 0 AND (asset_id IS NULL OR (active AND balance_valid))
      GROUP BY location_type, control_type ORDER BY location_type, control_type`, 'Prueba de saldos', '1');
    console.log(JSON.stringify({ check: 'live_read', rows: summary.rows }));

    const client = new Client({ connectionString: process.env.OFFICE_ASSISTANT_DATABASE_URL });
    await client.connect();
    try {
      // Even disabling the default read-only setting cannot grant table writes.
      for (const sql of ['SELECT "passwordHash" FROM public."User" LIMIT 0',
        "UPDATE rev_office.customers SET customer_name = 'TEST' WHERE false",
        'DELETE FROM public."StockLedger" WHERE false', 'SET ROLE rev']) {
        await client.query('BEGIN READ WRITE');
        let denied = false;
        try { await client.query(sql); } catch (error) {
          denied = (error as { code?: string }).code === '42501';
        } finally { await client.query('ROLLBACK'); }
        assert(denied, 'La base debe denegar lectura sensible, escrituras y escalamiento de rol.');
      }
      console.log('PASS: permisos PostgreSQL deniegan escrituras, credenciales y escalamiento.');
    } finally { await client.end(); }

    if (process.argv.includes('--live')) {
      // Explicit --live: sends the question and necessary query results to OpenAI.
      const assistant = new OfficeAssistantService(database);
      const question = process.argv.find((value) => value.startsWith('--question='))?.slice(11)
        || '¿Dónde están todos los tornillos niveladores de REV? ¿Cuántos hay en obra?';
      const result = await assistant.ask('local-smoke', { message: question, history: [] });
      assert(result.answer && result.evidence.length > 0, 'La respuesta debe contener evidencia real.');
      console.log(JSON.stringify({ check: 'live_agent', answer: result.answer,
        evidence: result.evidence.map(({ id, title, rows, truncated }) => ({ id, title, rows, truncated })) }, null, 2));
    }
  } finally { await database.onModuleDestroy(); }
}
main().catch((error) => {
  // Our application exceptions are sanitized; do not print provider/pg objects.
  const message = typeof error?.getResponse === 'function' ? error.getResponse() : error?.code || error?.name;
  console.error('Prueba del asistente no completada:', message);
  process.exitCode = 1;
});
