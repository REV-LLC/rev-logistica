import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/employees/[employeeId]/loans/loans.module.css', import.meta.url), 'utf8');

test('embedded loan sticky header and cells have an opaque background above scrolling rows', () => {
  assert.match(css, /\.embeddedLedger \.movementsTable thead,\s*\.embeddedLedger \.movementsTable thead th\s*\{\s*background:\s*#15293d;/);
  assert.match(css, /\.embeddedLedger \.movementsTable thead th\s*\{\s*color:\s*#eef4fa;/);
});

test('standalone loan table keeps its light header background', () => {
  assert.match(css, /\.movementsTable thead th\s*\{\s*background:\s*#e5edf5;/);
});

test('embedded loan ledger clips the sticky header to rounded upper corners only', () => {
  assert.match(css, /\.ledgerBody\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(css, /\.embeddedLedger\s*\{[^}]*border-radius:\s*var\(--mantine-radius-md\) var\(--mantine-radius-md\) 0 0;/);
});
