---
description: Validate the local Bland pathway workspace — compile the files and report errors and warnings before commit.
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Edit"
  - "Write"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Validate Bland Pathway

Compile the current local workspace and report validation results. Never call a pathway ready until validation passes with no errors.

Steps:

1. Run the sync engine and read its JSON stdout:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs" validate
   ```

2. Interpret the JSON result:
   - `ok: true`, no `errors` → validation passed. Keep any `warnings` visible in the summary and explain each one plainly. Missing End Call is advisory; do not add an End Call node just to silence a warning unless the user wants an explicit terminal step.
   - `errors` present → fix them on the correct surface:
     - prompt / condition / global prompt / edge label → native `Edit`/`Write` on the prose file.
     - variables / model / node tools / unit tests → the matching Bland MCP `set_*` tool. Never hand-write a structured YAML.
     Then re-run `node "${CLAUDE_PLUGIN_ROOT}/plugins/norm/bin/norm-sync.cjs" validate` and repeat until errors are gone.
3. If validation reports a version mismatch / the server is ahead, stop and re-clone via `/norm:clone <pathway_id>` before editing further.
4. If this validation is part of a create, edit, or fix task and there are no errors, continue: run targeted tests when useful (`/norm:test`), then commit in the same run (`/norm:commit`). Do not stop at a clean validation pass and ask whether to save.

Report: validation status (pass/fail), the list of remaining warnings, and what was fixed.
