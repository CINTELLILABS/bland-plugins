---
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Validate Bland Pathway

Validate the active Bland Norm pathway workspace.

Steps:

1. Call `get_norm_workspace_status`.
2. Call `validate_pathway`.
3. If validation returns errors, fix them and rerun `validate_pathway`.
4. If validation returns warnings, keep them in the summary.
5. If this validation is part of a create, edit, fix, or update task and there are no validation errors, continue through tests when useful and call `commit_pathway_workspace` automatically.
