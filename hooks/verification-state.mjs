#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { commandFromPayload, isMutationCommand, isMutationTool, isShellTool, isVerificationCommand, responseSucceeded, verificationStatePath } from './lib/verification.mjs';
import { readPayload, writeJsonAtomic } from './lib/common.mjs';

const payload = await readPayload();
if (!payload) process.exit(0);

try {
  const toolName = payload.tool_name || payload.toolName || payload.name;
  const command = commandFromPayload(payload);
  const path = verificationStatePath(payload);
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  const mutation = isMutationTool(toolName) || (isShellTool(toolName) && isMutationCommand(command));
  const verification = isShellTool(toolName)
    && isVerificationCommand(command)
    && responseSucceeded(payload.tool_response || payload.toolResponse || payload.response);

  if (mutation) {
    writeJsonAtomic(path, {
      schema_version: 1,
      session_id: payload.session_id || payload.sessionId || 'unknown',
      mutation_observed: true,
      verified_after_mutation: false,
      updated_at: new Date().toISOString()
    });
  } else if (verification && previous?.mutation_observed) {
    writeJsonAtomic(path, {
      ...previous,
      verified_after_mutation: true,
      updated_at: new Date().toISOString()
    });
  }
} catch {
  // Verification tracking is advisory and must fail open on unavailable storage.
}
