/** Expand the native date picker's click target to the whole editable input. */
export function openDatePicker(input: HTMLInputElement) {
  if (input.disabled || input.readOnly || typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Keep the browser's normal date input behavior when it cannot open a picker.
  }
}
