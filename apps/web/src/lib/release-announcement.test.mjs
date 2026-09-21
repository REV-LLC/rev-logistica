import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildReleaseAnnouncement } = require('../../scripts/release-announcement.cjs');
const text = '# Préstamos\n\nConsulta tus movimientos.\n\nAbre Empleados.';
test('announcement is disabled outside production including Vercel projects dedicated to dev', () => {
  for (const env of [{}, { VERCEL_ENV: 'preview' }, { NEXT_PUBLIC_DEPLOYMENT_ENV: 'dev', VERCEL_ENV: 'production' }]) {
    assert.equal(buildReleaseAnnouncement(text, env), null);
  }
});
test('production announcement parses paragraphs and has a stable content identity', () => {
  const release = buildReleaseAnnouncement(text, { NEXT_PUBLIC_DEPLOYMENT_ENV: 'production' });
  assert.equal(release.title, 'Préstamos');
  assert.deepEqual(release.paragraphs, ['Consulta tus movimientos.', 'Abre Empleados.']);
  assert.match(release.id, /^[a-f0-9]{64}$/);
  assert.equal(release.id, buildReleaseAnnouncement(text.replaceAll('\n','\r\n')+'\n', { VERCEL_ENV: 'production' }).id);
  assert.notEqual(release.id, buildReleaseAnnouncement(text+' Actualizado.', { VERCEL_ENV: 'production' }).id);
});
test('blank content disables the announcement and invalid content fails a production build', () => {
  assert.equal(buildReleaseAnnouncement('  ', { VERCEL_ENV: 'production' }), null);
  assert.throws(() => buildReleaseAnnouncement('Sin título', { VERCEL_ENV: 'production' }), /UPDATE.md/);
});
