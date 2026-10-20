import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const panel = read('../app/employees/payroll/EmployeePayrollPanel.tsx');
const css = read('../app/employees/payroll/payroll.module.css');

test('standalone payroll reuses the approved Directory background, title and glass surface', () => {
  assert.match(panel, /import directoryStyles from '\.\.\/directory\.module\.css'/);
  assert.match(panel, /!embedded \? <EmployeePageBackground src="\/employees\/rev-directory-v1\.webp" mobileSrc="\/employees\/rev-directory-mobile-v1\.webp" variant="brand"/);
  assert.match(panel, /className=\{directoryStyles\.title\}/);
  assert.match(panel, /!embedded \? `\$\{directoryStyles\.surface\} \$\{styles\.surface\}` : undefined/);
});

test('payroll headers have no extra background and columns scroll together without overlapping text', () => {
  assert.match(css, /\.surface \.table table thead th\s*\{\s*background:\s*transparent;/);
  assert.match(css, /\.surface \.table table th:first-child,[^}]+\.surface \.table table tbody tr:hover td:last-child\s*\{[^}]*position:\s*static;[^}]*left:\s*auto;[^}]*right:\s*auto;[^}]*z-index:\s*auto;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
  assert.doesNotMatch(css, /--mantine-color-body:|background:\s*#|backdrop-filter:/);
});

test('mobile payroll rows remain free of nested white cards', () => {
  assert.match(css, /\.surface \.table :global\(\.mantine-Paper-root\)\s*\{\s*background:\s*transparent;/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test('payroll scrollbar stays transparent with a dark thumb on hover and drag', () => {
  assert.match(css, /\.surface \.table :global\(\.mantine-ScrollArea-scrollbar\),\s*\.surface \.table :global\(\.mantine-ScrollArea-scrollbar\):hover,\s*\.surface \.table :global\(\.mantine-ScrollArea-scrollbar\):active,\s*\.surface \.table :global\(\.mantine-ScrollArea-corner\)\s*\{\s*background-color:\s*transparent;/);
  assert.match(css, /\.surface \.table :global\(\.mantine-ScrollArea-thumb\),\s*\.surface \.table :global\(\.mantine-ScrollArea-scrollbar\):hover > :global\(\.mantine-ScrollArea-thumb\),\s*\.surface \.table :global\(\.mantine-ScrollArea-scrollbar\):active > :global\(\.mantine-ScrollArea-thumb\)\s*\{\s*background-color:\s*rgb\(0 0 0 \/ 40%\);/);
});

test('larger payroll action buttons never enlarge the decorative photo zoom indicator', () => {
  assert.match(css, /\.surface \.table :global\(\.mantine-ActionIcon-root\):not\(\[aria-hidden='true'\]\)\s*\{/);
  assert.doesNotMatch(css, /\.surface \.table :global\(\.mantine-ActionIcon-root\)\s*\{/);
});
