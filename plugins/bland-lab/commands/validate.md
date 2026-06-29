---
description: Validate the active Bland pathway workspace and report errors or warnings.
allowed-tools:
  - "mcp__plugin_norm_bland__*"
---

# Validate Bland Pathway

Validate the active Bland Norm pathway workspace.

Steps:

1. Call `get_norm_workspace_status` to confirm a workspace is active.
2. Call `validate_pathway`.
3. If validation returns errors, fix those before testing or committing.
4. If validation returns warnings, preserve them in the user-facing summary unless they are clearly unrelated and pre-existing.
5. If prompt, routing, tool, or node behavior changed, run a relevant Test Bed or scenario test before `commit_pathway_workspace`.

When this validation is part of a create/edit/fix/update task, do not stop here. Commit automatically after errors are resolved.
