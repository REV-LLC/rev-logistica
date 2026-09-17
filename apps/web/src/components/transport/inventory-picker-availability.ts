export function isPickerQuantityAvailable(type: 'bulk' | 'serial', quantity: number) {
  return type === 'bulk' ? Number.isFinite(quantity) && quantity > 0 : quantity === 1;
}

type PickerSelectionRow = { key: string; disabled: boolean };

export function getSelectablePickerRows<T extends PickerSelectionRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => !row.disabled);
}

// Shared by individual selection and "select visible": unavailable rows never
// enter the selection, even when a caller passes a mixed list.
export function togglePickerRows(current: ReadonlySet<string>, rows: readonly PickerSelectionRow[]): Set<string> {
  const selectable = getSelectablePickerRows(rows);
  const next = new Set(current);
  const allSelected = selectable.length > 0 && selectable.every((row) => next.has(row.key));
  for (const row of selectable) {
    if (allSelected) next.delete(row.key);
    else next.add(row.key);
  }
  return next;
}
