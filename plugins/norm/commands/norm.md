---
description: Activate Norm — invoke the super_norm agent to create, edit, simulate, test, debug, and publish Bland agents end to end.
allowed-tools:
  - "Task"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm

Orchestrate the user's Bland agent request through the `super_norm` agent. You are the entry point; `super_norm` owns the workflow doctrine (file model, semantics-first, validate-before-ready, auto-commit, drift handling).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `super_norm` agent (via the `Task` tool, `subagent_type: super_norm`) and hand it the user request verbatim. Let it classify the work as create, edit, simulate/test, debug, publish, or inspect and drive the lanes:
   - Prose surfaces (`node.md`, `condition.md`, edge labels, `.pathways/global_prompt.md`) → native `Read`/`Write`/`Edit`.
   - Structured surfaces (variables, model, node tools, unit tests) → Bland MCP `set_*` tools only.
   - Server round-trips (clone, validate, test, commit, status) → the `/norm:*` commands, which shell out to the bundled sync engine at `${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs`.
2. If MCP availability, auth, or environment is unclear, have the agent call `get_bland_mcp_setup` before choosing a workflow.
3. Before any real outbound call, message, delete, publish, promote, or other high-impact action, get explicit user confirmation. Simulations, validation, and read-only inspection never need it.
4. After create/edit/fix work validates with no errors, commit in the same run (`/norm:commit`). Do not stop at a clean local workspace — a clean file tree is not a saved pathway.
5. Final answer must include the persisted pathway id/version when applicable, production/promotion status, validation status, tests run, and any remaining warnings or placeholder values the user must replace.

Do not hand-simulate conversations or invent IDs, validation results, or test outcomes when Bland tooling is available.
