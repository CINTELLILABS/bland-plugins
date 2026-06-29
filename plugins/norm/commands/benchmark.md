---
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Benchmark Pathway Creation

Compare this Claude Code plugin workflow against the existing BlandCode `super_norm` agent.

Use the benchmark task:

```text
claude-plugin-bland-lab/benchmarks/pathway-creation/tasks/appointment-booking-agent.md
```

Plugin HTTP MCP run:

1. Use the `super_norm` plugin agent.
2. Call `begin_pathway_generation` with `name: "Benchmark appointment booking - HTTP MCP"`.
3. Build the pathway through Bland MCP file and structured tools.
4. Call `validate_pathway`.
5. Run targeted node or Agent-to-Agent tests if useful.
6. Call `commit_pathway_workspace`.
7. Record pathway id, version id, promotion status, validation errors/warnings, tests, tool-call count, and whether the result is understandable to a non-developer.

BlandCode `super_norm` baseline:

1. Start the local server with `npm run dev`.
2. Run:

```bash
BLAND_API_URL=http://localhost:3000 BLAND_API_KEY=<key> \
  node claude-plugin-bland-lab/scripts/run-super-norm-baseline.mjs \
  --task appointment-booking-agent
```

Compare:

- Successful real pathway persistence.
- Validation errors and warnings.
- Behavior test quality.
- Time to completion.
- Tool-call count.
- Whether Claude recovered from issues without prompting.
- Whether a non-developer could understand the flow and final result.
