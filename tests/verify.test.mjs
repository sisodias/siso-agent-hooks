import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const verifier = join(root, 'scripts', 'verify.mjs');

test('privacy verifier scans publishable files outside hooks', () => {
  const baseline = spawnSync(process.execPath, [verifier], { cwd: root, encoding: 'utf8' });
  assert.equal(baseline.status, 0, baseline.stderr);

  const fixture = join(root, 'privacy-leak.fixture');
  try {
    writeFileSync(fixture, ['', 'Users', 'shaan' + 'sisodia', 'private'].join('/'));
    const leaked = spawnSync(process.execPath, [verifier], { cwd: root, encoding: 'utf8' });
    assert.notEqual(leaked.status, 0);
    assert.match(leaked.stderr, /privacy-leak\.fixture/);
  } finally {
    unlinkSync(fixture);
  }
});
