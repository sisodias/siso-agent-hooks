# SISO Agent Hooks

Portable lifecycle hooks for Claude Code and Codex. The package installs one audited hook payload, generates host-specific configuration, preserves unrelated hooks, and verifies every configured file reference.

## Install

Requires Node.js 20 or newer.

```bash
git clone https://github.com/sisodias/siso-agent-hooks.git
cd siso-agent-hooks
node bin/siso-hooks.mjs install
node bin/siso-hooks.mjs doctor
```

The installer writes versioned source under `~/.siso/agent-hooks/`, merges SISO-managed entries into `~/.claude/settings.json` and `~/.codex/hooks.json`, and creates a mode-`0600` backup before changing an existing configuration file.

Codex requires review of new or changed non-managed hooks. After installation, open `/hooks` in Codex, inspect the exact definitions, and trust them before expecting the commands to run. Codex parses but does not currently execute asynchronous command hooks, so its generated profile uses synchronous handlers.

It never imports a live settings file and never copies prompts, responses, transcripts, credentials, personal memory, databases, or private topology.

## Included hooks

| Hook | Outcome |
| --- | --- |
| `agent-state` | Privacy-reduced lifecycle state for operator surfaces |
| `checkpoint` | Metadata-only recovery checkpoint before compaction |
| `context-guard` | Advisory when transcript size crosses a threshold |
| `safety-guard` | Narrow denial of destructive broad-target commands |
| `skill-events` | Privacy-reduced skill invocation telemetry |
| `verify-stop` | Verification gate after code mutation |

`hooks.manifest.json` is the complete machine-readable event map for both hosts.

## Commands

```bash
node bin/siso-hooks.mjs install [--home PATH] [--dry-run]
node bin/siso-hooks.mjs doctor [--home PATH]
node bin/siso-hooks.mjs uninstall [--home PATH]
```

Uninstall removes only SISO-managed configuration groups and preserves the installed payload for recovery.

## Develop

```bash
npm test
npm run verify
```

## Boundary

This is the reusable public baseline. Shaan-specific hooks, project-specific gates, provider keys, private Herdr topology, raw telemetry, and personal memory remain private overlays. The public stack records those classes as explicit exclusions instead of pretending a clean clone can reproduce private state.

MIT licensed.
