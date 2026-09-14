import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { appendFileSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Run deliberately as a setup command, never from a request or the agent.
// Business rows are untouched; creates projections and a restricted login.
async function main() {
  const envPath = resolve(__dirname, '../.env');
  if (lstatSync(envPath).isSymbolicLink()) throw new Error('El archivo .env no puede ser un enlace.');
  process.loadEnvFile(envPath);
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('Falta DATABASE_URL.');
  const existingUrl = process.env.OFFICE_ASSISTANT_DATABASE_URL;
  const login = 'rev_office_reader';
  const source = new URL(sourceUrl);
  const readerUrl = new URL(existingUrl || sourceUrl);
  if (existingUrl && (readerUrl.username !== login || readerUrl.hostname !== source.hostname
    || readerUrl.port !== source.port || readerUrl.pathname !== source.pathname)) {
    throw new Error('La conexión de lectura debe apuntar a esta base con el usuario rev_office_reader.');
  }
  const password = existingUrl ? decodeURIComponent(readerUrl.password) : randomBytes(32).toString('hex');
  const client = new Client({ connectionString: sourceUrl, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [login]);
    if (role.rowCount && !existingUrl) {
      throw new Error('El rol rev_office_reader ya existe. Configure su conexión; no se rotó su clave.');
    }
    if (!role.rowCount) {
      // Newly generated hexadecimal password only; never log it.
      await client.query(`CREATE ROLE rev_office_reader LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    }
    await client.query(readFileSync(resolve(__dirname, 'office-assistant-views.sql'), 'utf8'));
    await client.query('GRANT USAGE ON SCHEMA rev_office TO rev_office_reader');
    await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA rev_office FROM rev_office_reader');
    await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA rev_office TO rev_office_reader');
    await client.query('ALTER ROLE rev_office_reader SET default_transaction_read_only = on');
    await client.query("ALTER ROLE rev_office_reader SET search_path = pg_catalog, rev_office");
    await client.query("ALTER ROLE rev_office_reader SET statement_timeout = '5s'");
    await client.query("ALTER ROLE rev_office_reader SET idle_in_transaction_session_timeout = '10s'");
    await client.query('COMMIT');
    if (!existingUrl) {
      readerUrl.username = login;
      readerUrl.password = password;
      readerUrl.searchParams.delete('schema');
      appendFileSync(envPath, `\nOFFICE_ASSISTANT_DATABASE_URL="${readerUrl.toString()}"\n`, { mode: 0o600 });
    }
    console.log('Vistas de Office y usuario de solo lectura configurados. Credencial guardada en apps/api/.env.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // pg errors can include SQL containing a generated password; do not log them.
  console.error('No se pudo preparar el acceso de Office. Revise conectividad, permisos de creación de roles y configuración del usuario de lectura.');
  const code = (error as { code?: string }).code;
  if (code && /^[A-Z0-9_]{2,30}$/.test(code)) console.error(`Código: ${code}`);
  if (code === '42703' || code === '42P01') console.error((error as Error).message);
  process.exitCode = 1;
});
