# Provenance

SISO Agent Hooks is an allowlisted, clean public projection of lifecycle patterns used across the SISO agent environment. It was authored as portable source rather than copied from live Claude or Codex settings.

The release manifest is the sole event-map authority. Host configuration is generated from that manifest, installed payloads are byte-compared with release source by `doctor`, and privacy verification scans every publishable file.

Observed and verified on 2026-08-01 with Node.js 20, Claude-compatible hook JSON, and Codex CLI 0.146.0. Codex hook structure and trust behavior were checked against the current official Codex manual and a clean temporary-home config load.

Private operational hooks, provider credentials, machine topology, personal memory, transcripts, databases, and generated state are intentionally excluded.
