#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPayload, safeId, stateRoot } from './lib/common.mjs';

const payload = await readPayload();
if (!payload) process.exit(0);
const toolName = payload.tool_name || payload.toolName;
if (toolName !== 'Skill') process.exit(0);

const toolInput = payload.tool_input || payload.toolInput || {};
const skill = toolInput.skill || toolInput.name || toolInput.command;
if (!skill) process.exit(0);

try {
  const directory = join(stateRoot(), 'telemetry');
  mkdirSync(directory, { recursive: true });
  appendFileSync(join(directory, 'skill-events.jsonl'), `${JSON.stringify({
    schema_version: 1,
    occurred_at: new Date().toISOString(),
    session_id: safeId(payload.session_id || payload.sessionId),
    skill: String(skill).slice(0, 200),
    cwd: typeof payload.cwd === 'string' ? payload.cwd : null
  })}\n`, { mode: 0o600 });
} catch {
  // Telemetry is optional and must fail open.
}
