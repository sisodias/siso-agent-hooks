#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'hooks.manifest.json'), 'utf8'));
const failures = [];
const privatePatterns = [
  ['', 'Users', 'shaan' + 'sisodia'].join('/'),
  ['tail100d11', 'ts', 'net'].join('.'),
  ['ANTHROPIC', 'AUTH', 'TOKEN'].join('_'),
  ['OPENAI', 'API', 'KEY'].join('_'),
  ['.minimax', 'key'].join('-')
];

const inventory = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8'
});
if (inventory.status !== 0) failures.push('could not enumerate publishable files');
for (const relativePath of inventory.stdout.split('\n').filter(Boolean)) {
  const path = join(root, relativePath);
  const source = readFileSync(path);
  if (source.includes(0)) continue;
  const text = source.toString('utf8');
  for (const pattern of privatePatterns) {
    if (text.includes(pattern)) failures.push(`${relativePath}: forbidden public pattern ${pattern}`);
  }
}

for (const hook of manifest.hooks) {
  const path = join(root, hook.file);
  if (!existsSync(path)) {
    failures.push(`manifest file missing: ${hook.file}`);
    continue;
  }
  const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(`${hook.file}: syntax check failed`);
}

for (const profile of Object.values(manifest.profiles)) {
  for (const entry of Object.values(profile.events).flat()) {
    if (!manifest.hooks.some((hook) => hook.id === entry.hook)) {
      failures.push(`profile references unknown hook: ${entry.hook}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`PASS hooks manifest: ${manifest.hooks.length} portable hooks, ${Object.keys(manifest.profiles).length} host profiles`);
