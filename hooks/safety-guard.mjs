#!/usr/bin/env node
import { denyPreTool, readPayload } from './lib/common.mjs';
import { commandFromPayload, isShellTool } from './lib/verification.mjs';

const payload = await readPayload();
if (!payload) process.exit(0);
const toolName = payload.tool_name || payload.toolName || payload.name;
if (!isShellTool(toolName)) process.exit(0);

const command = commandFromPayload(payload);
const shellWords = command.match(/(?:[^\s"'\\]+|"(?:\\.|[^"])*"|'[^']*')+/g) || [];
const words = shellWords.map((word) => {
  if ((word.startsWith("'") && word.endsWith("'")) || (word.startsWith('"') && word.endsWith('"'))) {
    return word.slice(1, -1);
  }
  return word;
});

function isHardGitReset(tokens) {
  const gitIndex = tokens.findIndex((word) => /(?:^|\/)git$/i.test(word));
  if (gitIndex < 0) return false;
  const gitArgs = tokens.slice(gitIndex + 1);
  const resetIndex = gitArgs.indexOf('reset');
  if (resetIndex < 0) return false;
  return gitArgs.slice(resetIndex + 1).includes('--hard');
}

const forbidden = [
  { test: () => isHardGitReset(words), reason: 'git reset --hard can discard uncommitted work' },
  { pattern: /\bgit\s+checkout\s+--\s+/i, reason: 'git checkout -- can overwrite user changes' },
  { pattern: /\bpkill\s+-f\b/i, reason: 'pkill -f can terminate unrelated processes' },
  { pattern: /\brm\s+-(?=[^\n]*r)(?=[^\n]*f)[^\n]*\s+['"]?(?:\/|~\/?|\$HOME|\$\{HOME\})['"]?(?:\s|$)/i, reason: 'recursive deletion targets a broad home or root path' }
];

for (const rule of forbidden) {
  if ((rule.test && rule.test()) || (rule.pattern && rule.pattern.test(command))) {
    denyPreTool(`SISO safety guard blocked this command: ${rule.reason}. Resolve an explicit narrow target or use a recoverable operation.`);
    break;
  }
}
