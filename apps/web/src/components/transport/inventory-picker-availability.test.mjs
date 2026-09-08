import assert from 'node:assert/strict';
import test from 'node:test';
import { getSelectablePickerRows, isPickerQuantityAvailable, togglePickerRows } from './inventory-picker-availability.ts';

const cases = [[0, false], [-1, false], [NaN, false], [Infinity, false], [-Infinity, false], [0.5, true], [12, true]];
const rows = cases.map(([quantity], index) => ({
  key: `bulk-${index}`, quantity, disabled: !isPickerQuantityAvailable('bulk', quantity),
}));

for (const [index, [quantity, expected]] of cases.entries()) {
  test(`bulk ${String(quantity)}: disponibilidad y selección individual ${expected ? 'permitidas' : 'bloqueadas'}`, () => {
    assert.equal(isPickerQuantityAvailable('bulk', quantity), expected);
    const original = new Set(['outside-filter']);
    const next = togglePickerRows(original, [rows[index]]);
    assert.equal(next.has(rows[index].key), expected);
    assert.deepEqual(original, new Set(['outside-filter']));
    assert.ok(next.has('outside-filter'));
    assert.deepEqual(togglePickerRows(next, [rows[index]]), original);
  });
}

test('contador y seleccionar visibles excluyen cero, negativos y no finitos, sin eliminar referencias del catálogo', () => {
  const before = structuredClone(rows);
  const selectable = getSelectablePickerRows(rows);
  assert.deepEqual(selectable.map(row => row.quantity), [0.5, 12]);
  assert.equal(selectable.length, 2);
  const selected = togglePickerRows(new Set(), rows);
  assert.deepEqual([...selected], selectable.map(row => row.key));
  assert.deepEqual(togglePickerRows(selected, rows), new Set());
  assert.deepEqual(rows, before);
});

test('los ya agregados tampoco entran al contador ni a seleccionar visibles', () => {
  const alreadyAdded = { key: 'already-added', quantity: 10, disabled: true };
  const mixed = [...rows, alreadyAdded];
  assert.equal(getSelectablePickerRows(mixed).length, 2);
  assert.equal(togglePickerRows(new Set(), mixed).has(alreadyAdded.key), false);
});

test('selección parcial agrega sólo los visibles válidos y conserva selecciones fuera del filtro', () => {
  const [first, second] = getSelectablePickerRows(rows);
  const selected = togglePickerRows(new Set(['outside-filter', first.key]), rows);
  assert.deepEqual(selected, new Set(['outside-filter', first.key, second.key]));
  assert.deepEqual(togglePickerRows(selected, rows), new Set(['outside-filter']));
});

test('confirmación revalida filas: una selección antigua que ya no está disponible no se entrega al callback', () => {
  const selection = new Set(['changed-to-zero', 'still-available']);
  const currentRows = [
    { key: 'changed-to-zero', disabled: !isPickerQuantityAvailable('bulk', 0) },
    { key: 'still-available', disabled: !isPickerQuantityAvailable('bulk', 0.5) },
  ];
  assert.deepEqual(getSelectablePickerRows(currentRows).filter(row => selection.has(row.key)).map(row => row.key), ['still-available']);
});

test('el criterio de equipos serializados sigue requiriendo exactamente una unidad', () => {
  for (const quantity of [0, -1, NaN, Infinity, 0.5, 2]) {
    assert.equal(isPickerQuantityAvailable('serial', quantity), false);
  }
  assert.equal(isPickerQuantityAvailable('serial', 1), true);
});
