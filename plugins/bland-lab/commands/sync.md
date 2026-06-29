---
description: Show or reset the active Bland MCP workspace and remount pathway state.
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Show Bland Norm Workspace

Show the current Bland Norm workspace state.

Recommended behavior:

1. Call `get_norm_workspace_status`.
2. If the workspace is stale or the user wants a clean start, call `reset_norm_workspace`.
3. For existing pathways, remount with `begin_pathway_edit`.
4. For new pathways, remount with `begin_pathway_generation`.
5. Call `list_files` and `validate_pathway` to verify the active workspace state.

There is no local filesystem sync in the HTTP MCP flow. The Bland MCP session owns the live Norm fileMap until `commit_pathway_workspace`.
