#!/usr/bin/env node
import { join } from 'node:path';
import { readPayload, safeId, stateRoot, writeJsonAtomic } from './lib/common.mjs';

const payload = await readPayload();
if (!payload) process.exit(0);

try {
  const sessionId = safeId(payload.session_id || payload.sessionId);
  writeJsonAtomic(join(stateRoot(), 'checkpoints', `${sessionId}.json`), {
    schema_version: 1,
    session_id: sessionId,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
    trigger: payload.trigger || 'PreCompact',
    transcript_path: typeof payload.transcript_path === 'string' ? payload.transcript_path : null,
    created_at: new Date().toISOString(),
    privacy: 'metadata-only; conversation bodies are not copied'
  });
} catch {
  // Checkpoint storage failures cannot wedge the host lifecycle.
}
