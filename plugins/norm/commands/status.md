---
description: Show the current Bland Norm workspace state — active pathway, working version, local vs server drift, dirty files, and pending warnings.
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\":*)"
  - "Read"
  - "Glob"
---

# Bland Norm Workspace Status

Report the state of the local pathway workspace and whether it is in sync with the live server.

Steps:

1. Run the sync engine and read its JSON stdout. Add `--server` to also fetch the live server version for a drift check:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" status --server
   ```

   (Omit `--server` for a fast, zero-network local-hash diff against the manifest.)

2. Interpret the JSON result:
   - `ok: true` → report:
     - the active `pathway_id` and local working `version_id`,
     - the workspace `path` and file count (or "no pathway mounted"),
     - `dirty` — whether there are uncommitted local edits, and which files changed,
     - `server_version_id` vs local `version_id` — and whether the **server is ahead** (drift).
   - `ok: false` → surface `error` plainly. If no pathway is mounted, say so and point the user at `/norm:list` then `/norm:clone <pathway_id>`.
3. If the server is ahead of the local workspace, call this out as a stop-and-re-clone signal: tell the user to run `/norm:clone <pathway_id>` and re-apply in-progress prose edits before validating or committing. Do not hand-merge.
4. If `dirty` is true, remind the user to `/norm:validate` then `/norm:commit` to persist; an uncommitted local workspace is not a saved pathway.

Keep the report concise: pathway id, version, drift status, dirty status, and the single most useful next command.
