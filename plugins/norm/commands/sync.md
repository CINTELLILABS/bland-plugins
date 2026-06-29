---
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Show Bland Norm Workspace

Show the current Bland Norm workspace state.

Steps:

1. Call `get_norm_workspace_status`.
2. If a pathway is mounted, call `list_files`.
3. Report the active pathway id, working version id, file count, and whether there are review items or warnings to address.

There is no local filesystem sync in the HTTP MCP flow. The Bland MCP session owns the live Norm fileMap until `commit_pathway_workspace`.
