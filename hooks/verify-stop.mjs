#!/usr/bin/env node
import { readJsonLines, readPayload } from './lib/common.mjs';

const payload = await readPayload();
if (!payload || payload.stop_hook_active || typeof payload.transcript_path !== 'string') process.exit(0);

const events = readJsonLines(payload.transcript_path);
let mutationIndex = -1;
let verifiedAfterMutation = false;
let finalText = '';
const pendingVerificationIds = new Set();

for (let index = 0; index < events.length; index += 1) {
  const event = events[index];
  const content = event.message?.content || event.content;
  const blocks = Array.isArray(content) ? content : [];
  for (const block of blocks) {
    if (block?.type === 'tool_use') {
      if (['Edit', 'Write', 'MultiEdit', 'apply_patch'].includes(block.name)) {
        mutationIndex = index;
        verifiedAfterMutation = false;
      }
      if (index > mutationIndex && block.name === 'Bash') {
        const command = String(block.input?.command || '');
        if (/\b(test|pytest|vitest|jest|build|lint|typecheck|tsc|doctor|verify|smoke)\b/i.test(command)) {
          if (block.id) pendingVerificationIds.add(block.id);
        }
      }
    }
    if (block?.type === 'tool_result' && pendingVerificationIds.has(block.tool_use_id) && !block.is_error) {
      verifiedAfterMutation = true;
    }
    if (block?.type === 'text') finalText = block.text || finalText;
  }
}

const completionText = typeof payload.last_assistant_message === 'string'
  ? payload.last_assistant_message
  : finalText;
const claimsCompletion = /\b(done|complete|completed|fixed|implemented|shipped|all set)\b/i.test(completionText);
if (mutationIndex < 0 || verifiedAfterMutation || !claimsCompletion) process.exit(0);
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: 'SISO verify gate: code was changed and completion was claimed without a later test, build, lint, typecheck, doctor, verify, or smoke command.'
}));
