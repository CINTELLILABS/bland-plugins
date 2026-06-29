---
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Create Bland Agent

Compatibility alias for `/norm:norm`.

Use the `super_norm` agent and Bland MCP tools to create or edit a real Bland pathway.

Default flow:

1. If MCP setup or tool availability is unclear, call `get_bland_mcp_setup` and `list_bland_mcp_tools`.
2. If this is a new agent, call `begin_pathway_generation`.
3. If this edits an existing agent, call `list_pathways` or `get_pathway` if needed, then `begin_pathway_edit`.
4. Build the pathway with file tools and structured tools.
5. Call `validate_pathway`.
6. Fix validation errors and validate again.
7. Run targeted tests if useful or requested.
8. Call `commit_pathway_workspace` after validation errors are resolved.
9. Summarize pathway id, pathway version id, production/promotion status, validation, tests, and warnings.

Do not ask whether to save after a clean validation pass. Commit in the same turn.
