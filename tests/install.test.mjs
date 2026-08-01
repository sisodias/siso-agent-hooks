import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'bin', 'siso-hooks.mjs');

function command(home, operation) {
  return spawnSync(process.execPath, [cli, operation, '--home', home], { encoding: 'utf8' });
}

test('clean temporary-home install is idempotent and doctor passes', () => {
  const home = mkdtempSync(join(tmpdir(), 'siso-hooks-home-'));
  const first = command(home, 'install');
  assert.equal(first.status, 0, first.stderr);
  const second = command(home, 'install');
  assert.equal(second.status, 0, second.stderr);
  const doctor = command(home, 'doctor');
  assert.equal(doctor.status, 0, doctor.stderr);

  const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
  const managed = Object.values(settings.hooks).flat().flatMap((group) => group.hooks)
    .filter((hook) => hook.command.includes('/.siso/agent-hooks/'));
  const manifest = JSON.parse(readFileSync(join(root, 'hooks.manifest.json'), 'utf8'));
  const expected = Object.values(manifest.profiles.claude.events).flat().length;
  assert.equal(managed.length, expected);
});

test('install preserves unrelated existing hooks', () => {
  const home = mkdtempSync(join(tmpdir(), 'siso-hooks-home-'));
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'existing-hook' }] }] }
  }));
  assert.equal(command(home, 'install').status, 0);
  const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
  assert.ok(settings.hooks.SessionStart.some((group) =>
    group.hooks.some((hook) => hook.command === 'existing-hook')));
  assert.ok(existsSync(join(home, '.codex', 'hooks.json')));
});

test('uninstall preserves unrelated commands that share a managed group', () => {
  const home = mkdtempSync(join(tmpdir(), 'siso-hooks-home-'));
  assert.equal(command(home, 'install').status, 0);
  const path = join(home, '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  const managedGroup = settings.hooks.SessionStart.find((group) =>
    group.hooks.some((hook) => hook.command.includes('/.siso/agent-hooks/')));
  managedGroup.hooks.push({ type: 'command', command: 'keep-me' });
  writeFileSync(path, JSON.stringify(settings));
  assert.equal(command(home, 'uninstall').status, 0);
  const after = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(after.hooks.SessionStart.some((group) =>
    group.hooks.some((hook) => hook.command === 'keep-me')));
});

test('doctor requires exact commands in the exact event', () => {
  const home = mkdtempSync(join(tmpdir(), 'siso-hooks-home-'));
  assert.equal(command(home, 'install').status, 0);
  const path = join(home, '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  const firstManaged = Object.values(settings.hooks).flat().find((group) =>
    group.hooks.some((hook) => hook.command.includes('/.siso/agent-hooks/')));
  firstManaged.hooks[0].command = `true # ${firstManaged.hooks[0].command}`;
  writeFileSync(path, JSON.stringify(settings));
  assert.notEqual(command(home, 'doctor').status, 0);
});

test('missing option values fail instead of targeting the real home', () => {
  const result = spawnSync(process.execPath, [cli, 'install', '--dry-run', '--home'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
});

test('unknown and missing operations fail while explicit help succeeds', () => {
  assert.equal(spawnSync(process.execPath, [cli, 'instal'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [cli, 'help'], { encoding: 'utf8' }).status, 0);
});

test('doctor rejects duplicate managed groups and modified payload files', () => {
  const home = mkdtempSync(join(tmpdir(), 'siso-hooks-home-'));
  assert.equal(command(home, 'install').status, 0);
  const path = join(home, '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.hooks.SessionStart.push(structuredClone(settings.hooks.SessionStart.at(-1)));
  writeFileSync(path, JSON.stringify(settings));
  assert.notEqual(command(home, 'doctor').status, 0);

  assert.equal(command(home, 'install').status, 0);
  const manifest = JSON.parse(readFileSync(join(root, 'hooks.manifest.json'), 'utf8'));
  const installed = join(home, '.siso', 'agent-hooks', manifest.version, manifest.hooks[0].file);
  writeFileSync(installed, `${readFileSync(installed, 'utf8')}\n// altered\n`);
  assert.notEqual(command(home, 'doctor').status, 0);
});
