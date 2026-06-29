---
description: Test the local Bland pathway — a focused node/runtime check when a node is named, or a full agent-to-agent simulation otherwise. Usage — /norm:test [node]
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Glob"
  - "mcp__bland__*"
---

# Test Bland Pathway

Run a behavior check against the current pathway. The optional argument selects the scope.

Argument: `$ARGUMENTS` — an optional node slug or node name to focus on. If empty, run a full-conversation simulation.

Steps:

1. Make sure the workspace validates first. If you have not validated since the last edit, run `/norm:validate` and resolve errors before testing.
2. Run the sync engine's offline round-trip self-check, then resolve the active pathway/version:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs" test
   node "${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs" status --server
   ```

   The engine's `test` is an offline tree↔graph round-trip self-check (catches structural corruption, not runtime behavior). Read the `status` JSON for `pathway_id`/`version_id`; if it reports the server is ahead, stop and re-clone via `/norm:clone` before testing.

3. For actual runtime/behavior testing, choose the test surface (Bland MCP tools — the engine does not run conversations):
   - **A node was named (`$ARGUMENTS` non-empty)** → focused Test Bed check of that one node/route/extraction/webhook. Use `mcp__bland__run_pathway_node_test`, then poll `mcp__bland__get_pathway_node_test_results` until it reports a terminal status.
   - **No node named** → full-conversation simulation (Agent-to-Agent Testing). Use `mcp__bland__create_agent_test_scenario`, then `mcp__bland__run_agent_test_scenario`, then poll `mcp__bland__get_agent_test_run` until it reports a terminal status.
4. Do not hand-simulate a conversation or call a node's webhook manually when these tools are available. Do not claim a test passed until a Bland test-result tool returns the status, transcript/assertions, or score.
5. Before triggering any real outbound call or message as part of testing, get explicit user confirmation. Seeded simulations and node tests do not need confirmation.

Report: what was tested (node vs full conversation), the run id, the terminal status, and the key assertions/transcript/score. If the test failed, localize the defect to a surface (prompt prose, condition prose, edge label, tool schema, variables, or model) and propose the smallest fix.
