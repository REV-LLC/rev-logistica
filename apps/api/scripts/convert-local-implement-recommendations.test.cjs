const assert = require('node:assert/strict');
const { test } = require('node:test');
const { localDatabaseUrl, recommendedRule, ruleChanged, unchangedConfiguration } = require('./convert-local-implement-recommendations.cjs');

const entry = { id: 'entry', configurationId: 'config', assetId: 'explicit-unit', skuId: null,
  accessoryId: null, familyId: null, role: 'COMPONENT', quantity: 1, sortOrder: 3,
  defaultIncluded: false, recommendation: false, required: false, maximumQuantity: null };

test('only the authorized local clone is accepted, never production or other databases', () => {
  assert.doesNotThrow(() => localDatabaseUrl('postgresql://qa:qa@127.0.0.1:54414/configuration_ui_qa_20261002'));
  for (const url of [undefined, 'postgresql://qa:qa@db.production:5432/configuration_ui_qa_20261002',
    'postgresql://qa:qa@127.0.0.1:5432/configuration_ui_qa_20261002',
    'postgresql://qa:qa@127.0.0.1:54414/other',
    'postgresql://qa:qa@127.0.0.1:54414/configuration_ui_qa_20261002?host=remote'])
    assert.throws(() => localDatabaseUrl(url));
});

test('requirements, cap-only rules, default selections and family templates become recommendations', () => {
  for (const changes of [{ required: true }, { maximumQuantity: 3 }, { defaultIncluded: true },
    { assetId: null, familyId: 'suggested-family' }]) {
    const original = { ...entry, ...changes };
    const updated = recommendedRule(original);
    assert.equal(updated.required, false);
    assert.equal(updated.maximumQuantity, null);
    assert.equal(updated.recommendation, true);
    assert.equal(updated.assetId, original.assetId);
    assert.equal(updated.familyId, original.familyId);
    assert.equal(updated.quantity, original.quantity);
    assert.equal(updated.defaultIncluded, original.defaultIncluded);
    assert.deepEqual(original, { ...entry, ...changes });
    assert.equal(ruleChanged(updated), false, 'repeat conversion is a no-op');
  }
});

test('optional concrete compatibility links remain optional and identities never change', () => {
  assert.deepEqual(recommendedRule(entry), entry);
  assert.equal(ruleChanged(entry), false);
  const config = { id: 'config', assetId: 'parent', notes: 'preserve', version: 4, updatedAt: 'old', entries: [{ ...entry, required: true }] };
  const after = { ...config, version: 5, updatedAt: 'new', entries: config.entries.map(recommendedRule) };
  assert.deepEqual(unchangedConfiguration(after), unchangedConfiguration(config));
  assert.notDeepEqual(unchangedConfiguration({ ...after, entries: [{ ...after.entries[0], assetId: 'other' }] }), unchangedConfiguration(config));
});
