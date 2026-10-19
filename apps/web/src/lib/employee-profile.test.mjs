import { test } from 'node:test';
import assert from 'node:assert/strict';
import { employeeProfileBackground, employeeProfileHref, employeeProfileName, employeeProfileVehicleLabel } from './employee-profile.ts';
import { employeeRoleLabels } from './employee-roles.ts';

test('profile links use their own page, not the directory modal query', () => {
  assert.equal(employeeProfileHref('b1773f6a-a59d-44e6-951a-c25b9b782c57'), '/employees/b1773f6a-a59d-44e6-951a-c25b9b782c57');
  assert.equal(employeeProfileHref('a/b?x=1#y'), '/employees/a%2Fb%3Fx%3D1%23y');
});

test('job labels are shared with employee cards and stay readable in Spanish', () => {
  assert.equal(employeeRoleLabels.DRIVER, 'Conductor');
  assert.equal(employeeRoleLabels.OFFICE, 'Oficina');
  assert.equal(employeeRoleLabels.HEAVY_MACHINERY_OPERATOR, 'Operario maquinaria amarilla');
});

test('assigned truck shows its readable description and plate, never its internal ID', () => {
  const truck = { id: 'private-internal-id', plate: 'ABC123', brand: ' CHEVROLET ', model: ' NPR ' };
  assert.equal(employeeProfileVehicleLabel(truck), 'CHEVROLET NPR · ABC123');
  assert.equal(employeeProfileVehicleLabel({ ...truck, brand: null, model: null }), 'Camión · ABC123');
  assert.equal(employeeProfileVehicleLabel({ ...truck, model: null }), 'CHEVROLET · ABC123');
});
test('profile displays a readable name without null or undefined text', () => {
  assert.equal(employeeProfileName({ name: 'HAROLD', lastName: 'PRUEBA LOCAL' }), 'HAROLD PRUEBA LOCAL');
  assert.equal(employeeProfileName({ name: 'HAROLD', lastName: null }), 'HAROLD');
});

test('profile background follows the employee job, with no wrong-role image while loading', () => {
  assert.equal(employeeProfileBackground(), null);
  assert.equal(employeeProfileBackground('DRIVER'), '/employees/transport-v1.webp');
  assert.equal(employeeProfileBackground('HEAVY_MACHINERY_OPERATOR'), '/login/excavator.webp');
  assert.equal(employeeProfileBackground('MACHINIST'), '/login/excavator.webp');
  assert.equal(employeeProfileBackground('OFFICE'), '/login/excavator.webp');
});
