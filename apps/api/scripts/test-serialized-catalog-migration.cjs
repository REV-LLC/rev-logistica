// Run from the repository root. Uses only the dedicated local Docker test DB.
// Fixtures are kept in an isolated schema for inspection; no existing rows change.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const schema = `serial_catalog_test_${randomUUID().replaceAll('-', '')}`;
const files = [
  'apps/api/scripts/test-provider-opening-migration.sql',
  'apps/api/prisma/migrations/20260907170000_provider_catalog_opening_balance/migration.sql',
  'apps/api/scripts/test-serialized-catalog-migration.sql',
  'apps/api/prisma/migrations/20260908120000_serialized_catalog_opening_balance/migration.sql',
  'apps/api/scripts/assert-serialized-catalog-migration.sql',
];
const input = `CREATE SCHEMA ${schema}; SET search_path TO ${schema};\n`
  + files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const result = spawnSync('docker', [
  'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'rev',
  '-d', 'rev_serial_catalog_test_20260908', '-v', 'ON_ERROR_STOP=1',
], { cwd: root, input, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error);
if (result.status === 0) console.log(`PASS: catalogue migration, audit preservation, constraints and location repair (${schema})`);
process.exitCode = result.status ?? 1;
