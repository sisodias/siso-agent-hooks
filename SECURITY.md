# Security policy

This repository is a public, portable baseline. Do not commit credentials, provider tokens, private network addresses, raw transcripts, prompt or response bodies, personal memory, runtime databases, or generated telemetry.

The installer only writes beneath the selected home directory, preserves unrelated configuration, and creates a backup before changing an existing host config. Test changes against a temporary home first:

```bash
node bin/siso-hooks.mjs install --home "$(mktemp -d)"
```

Report suspected vulnerabilities through GitHub's private vulnerability-reporting flow when enabled. Do not include real secrets or private transcripts in a public issue.
