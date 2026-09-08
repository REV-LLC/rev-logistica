import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentDateTime, getDocumentDateTimeInput } from './document-date-time.ts';

test('uses the Colombia date and 24-hour clock when the UTC date has already changed', () => {
  assert.deepEqual(getDocumentDateTimeInput('2026-09-09T04:45:00Z'), {
    date: '2026-09-08',
    time: '23:45',
  });
  assert.deepEqual(getDocumentDateTimeInput('2026-09-09T05:00:00Z'), {
    date: '2026-09-09',
    time: '00:00',
  });
});

test('stores the chosen hour for backdated and physical documents', () => {
  const timestamp = buildDocumentDateTime('2024-02-29', '23:59');
  assert.equal(timestamp, '2024-02-29T23:59:00-05:00');
  assert.equal(new Date(timestamp).toISOString(), '2024-03-01T04:59:00.000Z');
  assert.equal(buildDocumentDateTime('2026-09-08', '00:00'), '2026-09-08T00:00:00-05:00');
});

test('keeps the saved timestamp exactly when editing other fields and applies explicit time changes', () => {
  const saved = '2026-09-09T04:45:37.123Z';
  assert.equal(buildDocumentDateTime('2026-09-08', '23:45', saved), saved);
  assert.equal(buildDocumentDateTime('2026-09-08', '08:30', saved), '2026-09-08T08:30:00-05:00');
  assert.equal(buildDocumentDateTime('2026-09-07', '23:45', saved), '2026-09-07T23:45:00-05:00');
});

test('rejects incomplete hours and invalid calendar dates instead of silently changing them', () => {
  for (const time of ['', '7:00', '24:00', '12:60', '14:3', '14:30:00', '02:30 PM']) {
    assert.equal(buildDocumentDateTime('2026-09-08', time), null);
  }
  for (const date of ['', '2026-02-29', '2026-04-31', '2026-13-01', '08/09/2026']) {
    assert.equal(buildDocumentDateTime(date, '14:30'), null);
  }
});
