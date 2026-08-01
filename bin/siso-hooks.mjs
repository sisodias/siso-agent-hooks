#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'hooks.manifest.json'), 'utf8'));
const command = process.argv[2] || '';
let options;
try {
  options = parseOptions(process.argv.slice(3));
} catch (error) {
  console.error(`ERROR ${error.message}`);
  printUsage();
  process.exit(2);
}
const targetHome = resolve(options.home || homedir());
const installRoot = join(targetHome, '.siso', 'agent-hooks', manifest.version);

function parseOptions(args) {
  const parsed = {};
  const valueAfter = (index, option) => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    return value;
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--home') parsed.home = valueAfter(index++, '--home');
    else if (args[index] === '--dry-run') parsed.dryRun = true;
    else if (args[index] === '--no-claude') parsed.noClaude = true;
    else if (args[index] === '--no-codex') parsed.noCodex = true;
    else throw new Error(`Unknown option: ${args[index]}`);
  }
  return parsed;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function printUsage() {
  console.log('Usage: siso-hooks <install|doctor|uninstall> [--home PATH] [--dry-run] [--no-claude] [--no-codex]');
}

function hookFilesById() {
  return new Map(manifest.hooks.map((hook) => [hook.id, hook.file]));
}

function managedCommand(entry, files) {
  const file = files.get(entry.hook);
  if (!file) throw new Error(`Unknown hook id in profile: ${entry.hook}`);
  const args = (entry.args || []).map(shellQuote).join(' ');
  return `node ${shellQuote(join(installRoot, file))}${args ? ` ${args}` : ''}`;
}

function managedGroup(entry, files) {
  const group = { hooks: [{
    type: 'command',
    command: managedCommand(entry, files),
    ...(entry.timeout ? { timeout: entry.timeout } : {}),
    ...(entry.async ? { async: true } : {})
  }] };
  if (entry.matcher) group.matcher = entry.matcher;
  return group;
}

function isManagedGroup(group) {
  return Array.isArray(group?.hooks) && group.hooks.some((hook) =>
    typeof hook.command === 'string' && hook.command.includes('/.siso/agent-hooks/'));
}

function stripManagedHooks(group) {
  const hooks = (group?.hooks || []).filter((hook) =>
    !(typeof hook.command === 'string' && hook.command.includes('/.siso/agent-hooks/')));
  return hooks.length ? { ...group, hooks } : null;
}

function applyProfile(profileName, mode) {
  const profile = manifest.profiles[profileName];
  const target = join(targetHome, profile.target);
  const existing = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
  existing.hooks ||= {};

  for (const event of Object.keys(existing.hooks)) {
    existing.hooks[event] = existing.hooks[event].map(stripManagedHooks).filter(Boolean);
    if (existing.hooks[event].length === 0) delete existing.hooks[event];
  }

  if (mode === 'install') {
    const files = hookFilesById();
    for (const [event, entries] of Object.entries(profile.events)) {
      existing.hooks[event] ||= [];
      existing.hooks[event].push(...entries.map((entry) => managedGroup(entry, files)));
    }
  }

  if (options.dryRun) {
    console.log(`${mode}: would update ${target}`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    writeFileSync(`${target}.siso-backup-${Date.now()}`, readFileSync(target), { mode: 0o600 });
  }
  writeFileSync(target, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600 });
  console.log(`${mode}: updated ${target}`);
}

function install() {
  if (options.dryRun) console.log(`install: would copy portable hooks to ${installRoot}`);
  else {
    mkdirSync(installRoot, { recursive: true });
    cpSync(join(repositoryRoot, 'hooks'), join(installRoot, 'hooks'), { recursive: true });
    cpSync(join(repositoryRoot, 'hooks.manifest.json'), join(installRoot, 'hooks.manifest.json'));
  }
  if (!options.noClaude) applyProfile('claude', 'install');
  if (!options.noCodex) applyProfile('codex', 'install');
}

function uninstall() {
  if (!options.noClaude) applyProfile('claude', 'uninstall');
  if (!options.noCodex) applyProfile('codex', 'uninstall');
  console.log(`uninstall: payload preserved at ${installRoot}`);
}

function doctor() {
  const failures = [];
  for (const hook of manifest.hooks) {
    const installed = join(installRoot, hook.file);
    if (!existsSync(installed)) failures.push(`missing installed hook: ${installed}`);
    else {
      const releaseSource = join(repositoryRoot, hook.file);
      if (!readFileSync(installed).equals(readFileSync(releaseSource))) {
        failures.push(`installed hook differs from release source: ${installed}`);
      }
      const result = spawnSync(process.execPath, ['--check', installed], { encoding: 'utf8' });
      if (result.status !== 0) failures.push(`syntax failure: ${installed}`);
    }
  }
  for (const [profileName, profile] of Object.entries(manifest.profiles)) {
    if ((profileName === 'claude' && options.noClaude) || (profileName === 'codex' && options.noCodex)) continue;
    const target = join(targetHome, profile.target);
    if (!existsSync(target)) {
      failures.push(`missing config: ${target}`);
      continue;
    }
    const parsed = JSON.parse(readFileSync(target, 'utf8'));
    const files = hookFilesById();
    const expectedByEvent = new Map(Object.entries(profile.events).map(([event, entries]) => [
      event,
      entries.map((entry) => managedGroup(entry, files))
    ]));
    for (const [event, entries] of Object.entries(profile.events)) {
      const configuredGroups = parsed.hooks?.[event] || [];
      for (const expected of expectedByEvent.get(event)) {
        const matches = configuredGroups.filter((group) => isDeepStrictEqual(group, expected));
        if (matches.length !== 1) {
          failures.push(`${profileName} ${event} expected exactly one canonical group for ${expected.hooks[0].command}; found ${matches.length}`);
        }
      }
    }
    for (const [event, groups] of Object.entries(parsed.hooks || {})) {
      for (const group of groups) {
        const containsManaged = (group.hooks || []).some((hook) =>
          typeof hook.command === 'string' && hook.command.includes('/.siso/agent-hooks/'));
        if (!containsManaged) continue;
        const canonical = (expectedByEvent.get(event) || []).some((expected) => isDeepStrictEqual(group, expected));
        if (!canonical) failures.push(`${profileName} ${event} contains a misplaced, altered, duplicate, or mixed managed group`);
      }
    }
  }
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(`PASS siso-agent-hooks ${manifest.version}: payload and configured references verified`);
}

if (command === 'install') install();
else if (command === 'uninstall') uninstall();
else if (command === 'doctor') doctor();
else if (command === 'help' || command === '--help' || command === '-h') printUsage();
else {
  console.error(command ? `ERROR unknown operation: ${command}` : 'ERROR missing operation');
  printUsage();
  process.exit(2);
}
