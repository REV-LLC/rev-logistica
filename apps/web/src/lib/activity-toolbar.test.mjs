import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = file => readFileSync(new URL(`../app/employees/activities/${file}`, import.meta.url), 'utf8');

test('activity toolbar keeps separate employee and period navigation in the shared glass bar', () => {
  const panel = read('EmployeeActivitiesPanel.tsx');
  assert.match(panel, /className=\{styles.toolbar\}/);
  assert.match(panel, /className=\{styles.toolbarContent\}/);
  for (const label of ['Empleado anterior', 'Empleado siguiente', 'Mes anterior', 'Mes siguiente', 'Agregar actividad']) {
    assert.ok(panel.includes(`aria-label="${label}"`));
  }
  assert.match(panel, /aria-label="Mes del calendario"/);
  assert.match(panel, /aria-label="Año del calendario"/);
  assert.match(panel, /!selfService \? <AddActivityMenu/);
  assert.match(panel, /!embedded \? <div className=\{styles.employeeSwitch\}/);
});

test('employee capsule keeps photo preview separate from the employee selector', () => {
  const picker = read('EmployeeCalendarPicker.tsx');
  assert.ok(picker.indexOf('<EmployeePhotoControl') < picker.indexOf('<Popover.Target>'));
  assert.match(picker, /smallScreen \? 48 : largeScreen \? 88 : 64/);
  assert.match(picker, /onBeforePreview=\{beforePreview\}/);
  const css = read('activities.module.css');
  assert.match(css, /\.toolbarContent\s*\{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.employeePicker\s*\{[^}]*border: 1px solid/);
  assert.doesNotMatch(css, /height: 136px|min-height: 2\.7em/);
});
