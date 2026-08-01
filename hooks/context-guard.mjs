#!/usr/bin/env node
import { statSync } from 'node:fs';
import { additionalContext, readPayload } from './lib/common.mjs';

const payload = await readPayload();
if (!payload || typeof payload.transcript_path !== 'string') process.exit(0);

const threshold = Number(process.env.SISO_CONTEXT_WARN_BYTES || 4_000_000);
try {
  const bytes = statSync(payload.transcript_path).size;
  if (bytes >= threshold) {
    additionalContext('PreToolUse', `SISO context guard: transcript is ${bytes} bytes. Write a checkpoint and hand off before context quality degrades.`);
  }
} catch {
  // Fail open when the host does not expose a readable transcript.
}
