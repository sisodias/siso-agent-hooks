import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, mkdtempSync, openSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');

function run(relativePath, payload, args = [], environment = {}) {
  return spawnSync(process.execPath, [join(root, relativePath), ...args], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...environment }
  });
}

test('every hook fails open on malformed input', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'hooks.manifest.json'), 'utf8'));
  for (const hook of manifest.hooks) {
    const result = run(hook.file, '{broken');
    assert.equal(result.status, 0, hook.id);
  }
});

test('safety guard denies destructive broad commands', () => {
  for (const command of ['git reset --hard', "git reset '--hard'", 'git -C /tmp reset --hard', 'rm -rf /', 'rm -fr "$HOME"', 'rm -rf ~']) {
    const result = run('hooks/safety-guard.mjs', {
      tool_name: 'Bash', tool_input: { command }
    });
    assert.equal(result.status, 0, command);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny', command);
  }
});

test('safety guard allows ordinary commands', () => {
  const result = run('hooks/safety-guard.mjs', {
    tool_name: 'Bash', tool_input: { command: 'npm test' }
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('checkpoint stores metadata without conversation bodies', () => {
  const state = mkdtempSync(join(tmpdir(), 'siso-hook-state-'));
  const result = run('hooks/checkpoint.mjs', {
    session_id: 'abc', cwd: '/tmp/project', prompt: 'private prompt body'
  }, [], { SISO_STATE_HOME: state });
  assert.equal(result.status, 0);
  const checkpoint = readFileSync(join(state, 'checkpoints', 'abc.json'), 'utf8');
  assert.doesNotMatch(checkpoint, /private prompt body/);
});

test('verify stop blocks completion after unverified mutation', () => {
  const state = mkdtempSync(join(tmpdir(), 'siso-hook-state-'));
  const transcript = join(state, 'transcript.jsonl');
  writeFileSync(transcript, [
    JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: {} }] } }),
    JSON.stringify({ message: { content: [{ type: 'text', text: 'Implemented and complete.' }] } })
  ].join('\n'));
  const result = run('hooks/verify-stop.mjs', {
    session_id: 'verify-me', transcript_path: transcript, stop_hook_active: false
  }, [], { SISO_STATE_HOME: state });
  assert.equal(JSON.parse(result.stdout).decision, 'block');
  const repeated = run('hooks/verify-stop.mjs', {
    session_id: 'verify-me', transcript_path: transcript, stop_hook_active: false
  }, [], { SISO_STATE_HOME: state });
  assert.equal(JSON.parse(repeated.stdout).decision, 'block');
});

test('verify stop recognizes Codex apply_patch and last assistant message fields', () => {
  const state = mkdtempSync(join(tmpdir(), 'siso-hook-state-'));
  const transcript = join(state, 'transcript.jsonl');
  writeFileSync(transcript, JSON.stringify({
    message: { content: [{ type: 'tool_use', name: 'apply_patch', input: { command: '*** Begin Patch' } }] }
  }));
  const result = run('hooks/verify-stop.mjs', {
    session_id: 'codex', transcript_path: transcript, stop_hook_active: false,
    last_assistant_message: 'Implemented and complete.'
  }, [], { SISO_STATE_HOME: state });
  assert.equal(JSON.parse(result.stdout).decision, 'block');
});

test('verify stop allows a post-mutation test', () => {
  const state = mkdtempSync(join(tmpdir(), 'siso-hook-state-'));
  const transcript = join(state, 'transcript.jsonl');
  writeFileSync(transcript, [
    JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: {} }] } }),
    JSON.stringify({ message: { content: [{ type: 'tool_use', id: 'verify-1', name: 'Bash', input: { command: 'npm test' } }] } }),
    JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: 'verify-1', content: 'all tests passed' }] } }),
    JSON.stringify({ message: { content: [{ type: 'text', text: 'Implemented and complete.' }] } })
  ].join('\n'));
  const result = run('hooks/verify-stop.mjs', {
    session_id: 'verified', transcript_path: transcript, stop_hook_active: false
  }, [], { SISO_STATE_HOME: state });
  assert.equal(result.stdout, '');
});

test('verify stop does not accept an issued or failed test as verification', () => {
  for (const resultBlock of [null, { type: 'tool_result', tool_use_id: 'verify-1', is_error: true }]) {
    const state = mkdtempSync(join(tmpdir(), 'siso-hook-state-'));
    const transcript = join(state, 'transcript.jsonl');
    const lines = [
      { message: { content: [{ type: 'tool_use', name: 'Edit', input: {} }] } },
      { message: { content: [{ type: 'tool_use', id: 'verify-1', name: 'Bash', input: { command: 'npm test' } }] } },
      ...(resultBlock ? [{ message: { content: [resultBlock] } }] : []),
      { message: { content: [{ type: 'text', text: 'Implemented and complete.' }] } }
    ];
    writeFileSync(transcript, lines.map(JSON.stringify).join('\n'));
    const result = run('hooks/verify-stop.mjs', {
      session_id: 'not-verified', transcript_path: transcript, stop_hook_active: false
    }, [], { SISO_STATE_HOME: state });
    assert.equal(JSON.parse(result.stdout).decision, 'block');
  }
});

test('state-writing hooks fail open when state storage is unavailable', () => {
  for (const hook of ['hooks/agent-state.mjs', 'hooks/checkpoint.mjs', 'hooks/skill-events.mjs']) {
    const result = run(hook, {
      session_id: 'abc', tool_name: 'Skill', tool_input: { skill: 'test' }
    }, [], { SISO_STATE_HOME: '/dev/null' });
    assert.equal(result.status, 0, hook);
  }
});

test('transcript reader bounds I/O for large sparse transcripts', async () => {
  const state = mkdtempSync(join(tmpdir(), 'siso-hook-state-'));
  const transcript = join(state, 'large.jsonl');
  const descriptor = openSync(transcript, 'w');
  closeSync(descriptor);
  truncateSync(transcript, 512 * 1024 * 1024);
  const result = run('hooks/verify-stop.mjs', {
    session_id: 'sparse', transcript_path: transcript, stop_hook_active: false
  }, [], { SISO_STATE_HOME: state });
  assert.equal(result.status, 0);
});
