import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('profile portrait reserves the full photo size instead of overflowing a smaller slot', () => {
  const css = readFileSync(new URL('../app/employees/[employeeId]/profile.module.css', import.meta.url), 'utf8');
  const component = readFileSync(new URL('../components/EmployeeProfile.tsx', import.meta.url), 'utf8');
  const portrait = css.match(/\.portrait\s*\{([^}]+)\}/)[1];
  assert.match(portrait, /width: 200px;/);
  assert.match(portrait, /height: 200px;/);
  assert.match(portrait, /align-items: center;/);
  assert.match(component, /EmployeePhotoControl[^>]*size=\{200\}/);
  assert.doesNotMatch(portrait, /overflow: hidden/);
});
