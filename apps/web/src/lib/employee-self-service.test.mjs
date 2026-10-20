import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { employeeWorkspaceTab } from './employee-profile.ts';
import { getPostLoginDestination } from './auth.ts';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('self-service never selects payroll, even from a forged tab query', () => {
  for (const value of [null, '', 'payroll', 'salary', 'anything']) assert.equal(employeeWorkspaceTab(value, true), 'loans');
  assert.equal(employeeWorkspaceTab('activities', true), 'activities');
  assert.equal(employeeWorkspaceTab('loans', true), 'loans');
  assert.equal(employeeWorkspaceTab(null, false), 'payroll');
});
test('personal profiles survive driver and operator login redirects without opening management routes', () => {
  for (const role of ['DRIVER', 'OPERATOR']) {
    assert.equal(getPostLoginDestination('/profile?tab=loans', role), '/profile?tab=loans');
    assert.equal(getPostLoginDestination('/employees/payroll', role), '/');
    assert.equal(getPostLoginDestination('/employees/other/loans', role), '/');
  }
  assert.equal(getPostLoginDestination('/profile', 'WAREHOUSE_TABLET'), '/transport/generate');
});
test('the personal page reuses the existing identity and keeps the management layout restricted', () => {
  assert.match(read('../app/profile/page.tsx'), /<EmployeeProfile selfService/);
  assert.match(read('../app/employees/layout.tsx'), /allowedRoles=\{\['ADMIN', 'OFFICE'\]\}/);
  const profile = read('../components/EmployeeProfile.tsx');
  assert.match(profile, /selfService \? '\/employee-portal\/profile'/);
  assert.match(profile, /editable=\{!selfService\}/);
  const workspace = read('../app/employees/[employeeId]/EmployeeProfileWorkspace.tsx');
  assert.match(workspace, /!selfService \? <Tabs\.Panel value="payroll"/);
  assert.match(workspace, /keepMounted=\{false\}/);
  assert.match(workspace, /if \(selfService\) router\.replace\(`/);
});
test('personal loans and notes do not request management data or expose mutations', () => {
  const loans = read('../app/employees/[employeeId]/loans/EmployeeLoansPanel.tsx');
  assert.match(loans, /selfService \? '\/employee-portal\/loans'/);
  assert.match(loans, /!selfService \? <div className=\{styles\.addMovementFooter\}/);
  assert.match(loans, /selfService \|\| submitting\.current/);
  const activities = read('../app/employees/activities/EmployeeActivitiesPanel.tsx');
  assert.match(activities, /selfService \? Promise\.resolve/);
  assert.match(activities, /selfService \? `\/employee-portal\/activities\?month=/);
  assert.match(activities, /!selfService \? <AddActivityMenu/);
});
test('payroll editing and receipt issuance are Admin-only in every UI entry point', () => {
  const payroll = read('../app/employees/payroll/EmployeePayrollPanel.tsx');
  assert.match(payroll, /canEditPayroll = getCurrentUserRole\(\) === 'ADMIN'/);
  assert.match(payroll, /canEditPayroll && salaryEmployee/);
  const receipt = read('../app/employees/payroll/ReceiptModal.tsx');
  assert.match(receipt, /canIssue = getCurrentUserRole\(\) === 'ADMIN'/);
  assert.match(receipt, /if \(!canIssue \|\| !ready\?\.eligible/);
});
