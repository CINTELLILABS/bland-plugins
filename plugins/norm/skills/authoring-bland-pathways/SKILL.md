---
name: norm-pathway-workflow
description: Use when Norm creates, edits, simulates, tests, debugs, commits, publishes, or inspects Bland agents and pathways through Bland MCP.
---

# Authoring Bland Pathways

Use Bland MCP tools as the source of truth. The Claude Code plugin is only the UX wrapper around `/norm` and `super_norm`. Do not ask users to manage pathway JSON, git repos, local workspace files, or MCP details.

For a new pathway:

1. Call `begin_pathway_generation`.
2. Build the minimal complete flow first.
3. Use file tools for nodes, prompts, edges, and free-text conditions.
4. Use structured tools for variables, model config, unit tests, and node tools.
5. Call `validate_pathway`.
6. Fix validation errors and rerun validation.
7. Test behavior when useful. Use Agent-to-Agent Testing for full simulated conversations and Test Bed for focused node/runtime checks.
8. Call `commit_pathway_workspace` after validation errors are resolved.

For an existing pathway:

1. Use `list_pathways` or `get_pathway` if the target or version is unclear.
2. Call `begin_pathway_edit`.
3. Gather semantics context before editing routing, transfer, fallback, or tool behavior.
4. Apply the smallest correct edit.
5. Validate, fix errors, test when useful, then commit.

Commit behavior:

- `commit_pathway_workspace` is the real persistence boundary.
- New pathway commits promote the generated version to production.
- Existing pathway edit commits save a working version and may leave production unchanged.
- Never describe an uncommitted workspace as finished.
- Never ask "should I save it?" after a clean validation pass; commit in the same turn.

Simulation behavior:

- For "simulate a conversation", "test chat", or full end-to-end agent verification, use `create_agent_test_scenario`, `run_agent_test_scenario`, and `get_agent_test_run`.
- For targeted checks of one node, webhook, prompt, route, extraction, or seeded call behavior, use `run_pathway_node_test` and `get_pathway_node_test_results`.
- Do not hand-simulate or call external webhooks manually when Bland testing tools are available.
- Do not claim a test passed until a Bland test-result tool returns the status, transcript/assertions, or score.
