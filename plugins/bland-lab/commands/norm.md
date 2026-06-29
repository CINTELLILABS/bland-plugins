---
description: Activate Norm to create, edit, simulate, test, debug, and publish Bland agents.
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Norm

Use the `super_norm` custom agent and Bland MCP tools for the user's request.

User request:

```text
$ARGUMENTS
```

Norm operating mode:

1. Classify the request as create, edit, simulate/test, debug, publish, or inspect.
2. Use Bland MCP as the source of truth.
3. For new pathways, call `begin_pathway_generation`.
4. For existing pathways, call `list_pathways` or `get_pathway` if the target is unclear, then call `begin_pathway_edit`.
5. Use file, structured-editor, semantics, validation, testing, and commit tools directly.
6. For "simulate a conversation", "test chat", or end-to-end behavior checks, use Agent-to-Agent Testing tools:
   - `create_agent_test_scenario`
   - `run_agent_test_scenario`
   - `get_agent_test_run`
   - `list_agent_test_runs`
7. For focused node/runtime checks, use Test Bed:
   - `run_pathway_node_test`
   - `get_pathway_node_test_results`
8. After create/edit/fix work validates with no errors, call `commit_pathway_workspace` in the same run.
9. Final answer must include persisted pathway id/version when applicable, production/promotion status, validation status, tests run, and remaining warnings.

Do not hand-simulate if Bland testing tools are available. Do not invent IDs or test results.
