# Agent guide — SISO Agent Hooks

**In one line:** Portable lifecycle hooks for Claude Code and Codex, installing state, checkpoint and context-guard handlers into each host's configuration. District: `SISO_Agents` (`~/SISO_Workspace/SISO_Agents/siso-agent-hooks`).

This repository is the public, portable source for SISO lifecycle hooks shared by Claude Code and Codex.

## Rules

- `hooks.manifest.json` is the single authority for installed hooks and event wiring.
- Never copy a live `~/.claude/settings.json`, `~/.codex/hooks.json`, transcript, token, database, or machine path into this repository.
- Hooks must fail open on malformed input unless they are enforcing a narrowly documented safety invariant.
- Hook telemetry must exclude prompt and response bodies.
- Use only Node.js standard-library APIs in the portable hook layer.

## Verify

```bash
npm test
npm run verify
```

A release is ready only when a clean temporary-home install and `doctor` both pass.
