---
description: Benchmark plugin pathway authoring against the Blandcode SuperNorm baseline.
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Benchmark Pathway Creation

Compare `/norm` using the plugin `super_norm` custom agent against the existing Blandcode `super_norm` agent.

Use the same benchmark task for every run:

```text
benchmarks/pathway-creation/tasks/appointment-booking-agent.md
```

Plugin run:

1. Use the `super_norm` plugin agent.
2. Call `reset_norm_workspace`.
3. Call `begin_pathway_generation` with name `Benchmark appointment booking - plugin`.
4. Build the pathway using the real file/structured-editor tools.
5. Call `validate_pathway`.
6. Run a relevant Test Bed or agent scenario test if possible.
7. Call `commit_pathway_workspace` automatically once validation errors are resolved.
8. Record pathway ID/version, validation output, test output, tool-call count, and whether Claude recovered from issues without prompting.

Blandcode `super_norm` baseline:

1. Start the local server with `npm run dev`.
2. Run:

```bash
BLAND_API_URL=http://localhost:3000 BLAND_API_KEY=<key> \
  node scripts/run-super-norm-baseline.mjs --task appointment-booking-agent
```

Compare:

- Persisted pathway ID/version.
- Validation errors/warnings.
- Test Bed or scenario results.
- Time to completion.
- Tool-call count.
- Whether the resulting pathway is understandable to a non-developer.
- Whether Claude recovered from issues without prompting.
