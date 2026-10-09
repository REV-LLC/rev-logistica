const assert = require('node:assert/strict');
const { test } = require('node:test');
const { localPromotionDatabaseUrl, promotionArguments } = require('./promote-local-implement.cjs');
test('promotion never uses production, environment fallback, URL options or a different local database', () => {
  const allowed = 'postgresql://qa:qa@127.0.0.1:54414/configuration_ui_qa_20261002';
  assert.equal(localPromotionDatabaseUrl(allowed), allowed);
  for (const value of [undefined, 'postgresql://qa:qa@remote:54414/configuration_ui_qa_20261002',
    allowed.replace('54414', '5432'), allowed.replace('configuration_ui_qa_20261002', 'production'), `${allowed}?sslmode=disable`])
    assert.throws(() => localPromotionDatabaseUrl(value));
});
test('local script is single-target, preview by default and apply requires review plus backup', () => {
  const args = ['--accessory-id=c1b90a70-6c66-4b8b-a769-699382dd002a', '--sku-id=exact-sku', '--actor-id=exact-reviewer',
    '--effective-at=2026-10-06T16:00:00Z', '--asset-description=Balde estándar'];
  assert.equal(promotionArguments(args).apply, false);
  assert.equal(promotionArguments(args).input.assetDescription, 'Balde estándar');
  assert.throws(() => promotionArguments(args.map(value => value.replace('c1b90a70', 'c2b90a70'))));
  assert.throws(() => promotionArguments([...args, '--apply']));
  assert.equal(promotionArguments([...args, '--apply', `--expected-fingerprint=${'a'.repeat(64)}`, '--backup=/private/tmp/exact']).apply, true);
});
