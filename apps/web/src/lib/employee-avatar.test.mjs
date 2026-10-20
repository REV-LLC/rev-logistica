import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('employee thumbnails and full-size portraits always use a true circular radius', () => {
  const source = readFileSync(new URL('../components/EmployeeAvatar.tsx', import.meta.url), 'utf8');
  assert.match(source, /radius="50%"/);
  assert.doesNotMatch(source, /radius=\{fullSize/);
  assert.match(source, /<Skeleton[^>]*circle height=\{size\} width=\{size\}/);
});

test('employee photo button remains square with a circular outline at every avatar size', () => {
  const source = readFileSync(new URL('../components/EmployeePhotoControl.tsx', import.meta.url), 'utf8');
  const button = source.slice(source.indexOf('component="button"'), source.indexOf('<EmployeeAvatar'));
  assert.match(button, /borderRadius:\s*'50%'/);
  assert.match(button, /width:\s*size/);
  assert.match(button, /height:\s*size/);
});

test('employee photos share a circular clipping rule in thumbnails, profile and expanded preview', () => {
  for (const component of ['EmployeeAvatar', 'EmployeePhotoModal']) {
    const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /import photoShape from ['"]\.\/EmployeePhotoShape\.module\.css['"]/);
    assert.match(source, /className=\{photoShape\.circle\}/);
  }
  const css = readFileSync(new URL('../components/EmployeePhotoShape.module.css', import.meta.url), 'utf8');
  assert.match(css, /aspect-ratio:\s*1;/);
  assert.match(css, /border-radius:\s*50%;/);
  assert.match(css, /overflow:\s*hidden;/);
  assert.match(css, /clip-path:\s*circle\(50%\);/);
});
