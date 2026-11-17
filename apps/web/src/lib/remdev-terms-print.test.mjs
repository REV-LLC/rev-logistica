import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('printed remission and return terms stay readable without a tiny print override', () => {
  const css = readFileSync(new URL('../app/inventory/ledger/document/[documentId]/remdev-print.module.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/\.termsText\s*\{([^}]+)\}/g)];
  assert.equal(rules.length, 2);
  assert.match(rules[0][1], /font-size: 14px;/);
  assert.match(rules[0][1], /line-height: 1\.1;/);
  assert.match(rules[1][1], /font-size: 11\.2px;/);
  assert.match(rules[1][1], /line-height: 1\.05;/);
  assert.match(css, /\.termsBlock,[\s\S]*?break-inside: avoid;/);
});
