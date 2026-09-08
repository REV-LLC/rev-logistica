import assert from 'node:assert/strict';
import test from 'node:test';

import { getDocumentRequestNumber } from './request-number.ts';

test('sends physical numbers explicitly and leaves a blank number for automatic allocation', () => {
  assert.equal(getDocumentRequestNumber('19001', 'REMISSION', null), 'RM19001');
  assert.equal(getDocumentRequestNumber('DV-19001', 'RETURN', 'DV19001'), 'DV19001');
  assert.equal(getDocumentRequestNumber('', 'REMISSION', null), undefined);
});

test('lets the server preserve or switch an assigned APP series without echoing a stale number', () => {
  assert.equal(getDocumentRequestNumber('RM-APP-000001', 'REMISSION', 'RM-APP-000001'), undefined);
  assert.equal(getDocumentRequestNumber('RM-APP-000001', 'RETURN', 'RM-APP-000001'), undefined);
  assert.equal(getDocumentRequestNumber('DV-APP-000002', 'RETURN', 'DV-APP-000002'), undefined);
});

test('does not hide manually supplied reserved APP numbers from backend validation', () => {
  assert.equal(getDocumentRequestNumber('rm-app-000001', 'REMISSION', null), 'RM-APP-000001');
  assert.equal(getDocumentRequestNumber('RM-APP-000099', 'REMISSION', 'RM-APP-000001'), 'RM-APP-000099');
  assert.equal(getDocumentRequestNumber('19002', 'REMISSION', 'RM-APP-000001'), 'RM19002');
});
