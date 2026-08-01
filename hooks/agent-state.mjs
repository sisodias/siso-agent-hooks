#!/usr/bin/env node
import { join } from 'node:path';
import { readPayload, safeId, stateRoot, writeJsonAtomic } from './lib/common.mjs';

const payload = await readPayload();
if (!payload) process.exit(0);

try {
  const lifecycle = process.argv[2] || 'unknown';
  const sessionId = safeId(payload.session_id || payload.sessionId);
  writeJsonAtomic(join(stateRoot(), 'agent-state', `${sessionId}.json`), {
    schema_version: 1,
    session_id: sessionId,
    lifecycle,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
    agent_id: payload.agent_id ? safeId(payload.agent_id) : null,
    updated_at: new Date().toISOString()
  });
} catch {
  // Lifecycle telemetry is advisory and must fail open.
}
