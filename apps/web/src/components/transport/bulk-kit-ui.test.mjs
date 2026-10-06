import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
test('el modal de conjuntos no depende de que existan equipos serializados visibles', () => {
  const source = readFileSync(new URL('../InventoryDisplay.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('InventoryDisplay.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = 0;
  function walk(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'BulkKitConfigurationModal') {
      found++;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxExpression(parent) && parent.expression) {
          assert.ok(!/^showSerialSection\s*&&/.test(parent.expression.getText(tree)), 'El configurador debe abrir también en la vista solo BULK.');
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
  assert.equal(found, 1);
});
