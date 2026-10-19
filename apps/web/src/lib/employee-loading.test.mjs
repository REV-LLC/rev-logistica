import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('employee route fallback and pending requests use the same background-only loading state', () => {
  const fallback = read('../app/employees/loading.tsx');
  const directory = read('../app/employees/page.tsx');
  assert.match(fallback, /return <EmployeeDirectoryLoading\s*\/>/);
  assert.match(directory, /if \(requestedEmployeeId \|\| loading\) return <EmployeeDirectoryLoading/);
  assert.doesNotMatch(fallback + directory, /CollectionLoading/);
});

test('pending employee screen preserves responsive brand imagery and the shared loader marker without white cards', () => {
  const pending = read('../app/employees/EmployeeDirectoryLoading.tsx');
  assert.match(pending, /src="\/employees\/rev-directory-v1\.webp"/);
  assert.match(pending, /mobileSrc="\/employees\/rev-directory-mobile-v1\.webp"/);
  assert.match(pending, /data-page-loading="true"/);
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /role="status" aria-label=\{label\}/);
  assert.doesNotMatch(pending, /Skeleton|Paper|CollectionLoading|PageLoadingOverlay/);
  assert.match(read('../app/employees/directory.module.css'), /\.loadingSpace\s*\{\s*min-height:\s*52dvh;/);
});
