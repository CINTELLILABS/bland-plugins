---
description: Commit the local Bland pathway workspace back to the server, persisting a working version (and promoting production for new pathways).
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Glob"
---

# Commit Bland Pathway Workspace

Persist the current local workspace to the live Bland server. This is the real persistence boundary — a clean local file tree is not a saved pathway.

Optional argument: `$ARGUMENTS` — pass `--force` only to override a drift stop after the user has confirmed they want to overwrite newer server state.

Steps:

1. Before committing, the workspace should already validate clean. If you are unsure, run `/norm:validate` first and resolve all errors. Do not commit a workspace with validation errors.
2. Run the sync engine and read its JSON stdout. The engine performs a 3-way drift check, makes one update call, and re-pulls the baseline:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" commit
   ```

3. Interpret the JSON result:
   - `ok: true` → report the persisted `pathway_id`, the new `version_id`, and `promoted` (whether production was promoted). For newly generated pathways a commit promotes the working version to production; for edits it may save a working version without promoting. Do not claim production changed unless `promoted` is true.
   - `ok: false` → surface `error` plainly. If it reports a version mismatch / the server is ahead (drift), STOP: tell the user the workspace is stale, do not retry the commit, and re-clone via `/norm:clone <pathway_id>` before re-applying edits. Only run `commit --force` if the user has explicitly confirmed they want to overwrite the newer server state — never force silently.
4. After a successful commit, report validation status, any tests run, and remaining warnings or placeholder values the user must replace.

Do not ask "should I save it?" after a clean validation pass — committing is the expected final step of any create/edit/fix request.
