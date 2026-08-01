import { join } from 'node:path';
import { safeId, stateRoot } from './common.mjs';

const shellToolNames = new Set(['bash', 'exec', 'exec_command', 'functions.exec']);
const editToolNames = new Set(['edit', 'write', 'multiedit', 'apply_patch']);

export function normalizeToolName(value) {
  return String(value || '').toLowerCase();
}

export function commandFrom(value) {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return commandFrom(parsed) || value;
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== 'object') return '';
  return String(value.command || value.cmd || value.input?.command || value.input?.cmd || '');
}

export function commandFromPayload(payload) {
  return commandFrom(payload.tool_input || payload.toolInput || payload.input || payload.arguments);
}

export function isShellTool(name) {
  return shellToolNames.has(normalizeToolName(name));
}

export function isMutationTool(name) {
  return editToolNames.has(normalizeToolName(name));
}

export function isMutationCommand(command) {
  return /(?:\bsed\s+(?:[^\n]*\s)?-i\b|\bperl\s+(?:[^\n]*\s)?-pi\b|\b(?:tee|cp|mv|rm|touch|mkdir|install|truncate|patch)\b|\bgit\s+(?:apply|checkout|reset|restore|clean)\b|(?:^|[^<])>{1,2}\s*[^&]|\bnpm\s+(?:install|uninstall|update)\b)/i.test(command);
}

export function isVerificationCommand(command) {
  return /\b(test|pytest|vitest|jest|build|lint|typecheck|tsc|doctor|verify|smoke)\b/i.test(command);
}

export function responseSucceeded(response) {
  if (response === undefined || response === null) return false;
  if (typeof response === 'object') {
    if (response.is_error === true || response.error) return false;
    for (const key of ['exit_code', 'exitCode', 'status']) {
      if (typeof response[key] === 'number') return response[key] === 0;
    }
  }
  const text = typeof response === 'string' ? response : JSON.stringify(response);
  if (/\b(?:exit(?:ed)?(?:\s+with)?(?:\s+code)?|status)\s*[:=]?\s*[1-9]\d*\b/i.test(text)) return false;
  if (/\b(?:is_error|failed)\s*[:=]\s*true\b/i.test(text)) return false;
  return true;
}

export function verificationStatePath(payload) {
  return join(stateRoot(), 'verification', `${safeId(payload.session_id || payload.sessionId)}.json`);
}
