#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { readJsonLinesReverse, readPayload } from './lib/common.mjs';
import { commandFrom, isMutationCommand, isMutationTool, isShellTool, isVerificationCommand, responseSucceeded, verificationStatePath } from './lib/verification.mjs';

const payload = await readPayload();
if (!payload || payload.stop_hook_active || typeof payload.transcript_path !== 'string') process.exit(0);

let persisted = null;
try {
  const statePath = verificationStatePath(payload);
  if (existsSync(statePath)) persisted = JSON.parse(readFileSync(statePath, 'utf8'));
} catch {
  // Fall back to transcript inspection when state is unavailable.
}

let finalText = '';
let boundary = persisted?.verified_after_mutation ? 'verified' : (persisted?.mutation_observed ? 'mutation' : null);
const successfulResults = new Set();

for (const event of boundary ? [] : readJsonLinesReverse(payload.transcript_path)) {
  const content = event.message?.content || event.content;
  const blocks = Array.isArray(content) ? content : [];
  const record = event.response_item?.payload || event.payload;
  if (record?.type === 'custom_tool_call' || record?.custom_tool_call) blocks.push(record.custom_tool_call || record);
  if (record?.type === 'custom_tool_call_output' || record?.custom_tool_call_output) blocks.push(record.custom_tool_call_output || record);
  for (const block of blocks) {
    if (block?.type === 'tool_result' && !block.is_error && block.tool_use_id) successfulResults.add(block.tool_use_id);
    if (block?.type === 'custom_tool_call_output' && responseSucceeded(block.output) && block.call_id) successfulResults.add(block.call_id);
    if (block?.type === 'tool_use' || block?.type === 'custom_tool_call') {
      const name = block.name;
      const command = commandFrom(block.input);
      const id = block.id || block.call_id;
      if (isShellTool(name) && isVerificationCommand(command) && successfulResults.has(id)) {
        boundary = 'verified';
        break;
      }
      if (isMutationTool(name) || (isShellTool(name) && isMutationCommand(command))) {
        boundary = 'mutation';
        break;
      }
    }
    if (block?.type === 'text') finalText = block.text || finalText;
  }
  if (boundary) break;
}

const completionText = typeof payload.last_assistant_message === 'string'
  ? payload.last_assistant_message
  : finalText;
const claimsCompletion = /\b(done|complete|completed|fixed|implemented|shipped|all set)\b/i.test(completionText);
if (boundary !== 'mutation' || !claimsCompletion) process.exit(0);
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: 'SISO verify gate: code was changed and completion was claimed without a later test, build, lint, typecheck, doctor, verify, or smoke command.'
}));
