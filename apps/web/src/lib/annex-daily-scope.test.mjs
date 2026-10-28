import assert from 'node:assert/strict';
import test from 'node:test';
import { isDailyAnnex } from './annex-daily-scope.ts';

test('daily drafts allow zero prices and legacy daily rows', () => {
  assert.equal(isDailyAnnex({ machineDays: [], rentals: [{ pricing: { basePrice: '0' } }, { commercial: { mode: { unit: 'DAY' } } }] }), true);
});
test('historical hourly and metered drafts remain read-only', () => {
  for (const unit of ['HOUR', 'METER']) {
    assert.equal(isDailyAnnex({ machineDays: [], rentals: [{ commercial: { catalog: { unit } } }] }), false);
  }
  assert.equal(isDailyAnnex({ machineDays: [{}], rentals: [] }), false);
  assert.equal(isDailyAnnex({ machineDays: [], rentals: [{ metering: {} }] }), false);
  assert.equal(isDailyAnnex({ machineDays: [], rentals: [{ cutting: {} }] }), false);
});
