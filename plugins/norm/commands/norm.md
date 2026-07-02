---
description: Activate Norm, the end-to-end Bland agent builder. Use when the user wants to create, build, edit, fix, simulate, test, debug, or publish a Bland voice agent or pathway — or says "norm", or gives a broad agent-building request that spans multiple steps.
argument-hint: "<what to build, fix, or debug>"
allowed-tools:
  - "Task"
  - "SlashCommand"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" generate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" validate:*)"
  - "mcp__bland__get_bland_mcp_setup"
  - "mcp__bland__get_pathway_schema"
  - "mcp__bland__get_call_log"
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
   - Structured surfaces (variables, model, node tools, unit tests) → also edited as workspace files (`variables.yaml`, `model.yaml`, `tools.yaml`, `unit-tests.yaml`); they round-trip verbatim and persist as part of the `{ nodes, edges }` graph on `/norm:commit` (`call_bland_api`). There are no per-surface server tools — the file is the edit.
   - Server round-trips (clone, validate, test, commit, status) → the `/norm:*` commands. Each reads/writes the live server through the Bland MCP passthrough; the bundled `${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs` codec is OFFLINE/networkless and only transforms JSON ↔ files (`generate`/`rebuild`/`validate`).
2. If MCP availability, auth, or environment is unclear, have the agent call `get_bland_mcp_setup` before choosing a workflow.
3. Before any real outbound call, message, delete, publish, promote, or other high-impact action, get explicit user confirmation. Simulations, validation, and read-only inspection never need it.
4. After create/edit/fix work validates with no errors, commit in the same run (`/norm:commit`). Do not stop at a clean local workspace — a clean file tree is not a saved pathway.
5. Final answer must include the persisted pathway id/version when applicable, production/promotion status, validation status, tests run, and any remaining warnings or placeholder values the user must replace.

Do not hand-simulate conversations or invent IDs, validation results, or test outcomes when Bland tooling is available.
