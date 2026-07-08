---
description: Show the current Norm workspace state — active pathway, working version, local vs server drift, dirty files, pending warnings. Use when the user asks what pathway is loaded, whether there are unsaved/uncommitted changes, whether local files differ from the server, or just asks for status.
argument-hint: "[--server]"
allowed-tools:
  - "mcp__bland__bland_api_get"
  - "mcp__plugin_norm_bland__bland_api_get"
  - "Read"
  - "Glob"
  - "Grep"
---

# Bland Norm Workspace Status

Report the state of the local pathway workspace and whether it is in sync with the live server. A `--server` argument adds a live drift check; without it the report is a fast, zero-network local diff.

Steps:

1. **Locate the workspace and baseline.** `Glob` `pathway/` for the file tree and read the baseline at `.norm/baseline.json` (written on clone/commit). If there is no `pathway/` tree or no baseline, no pathway is mounted — say so and point the user at `/norm:list` then `/norm:clone <pathway_id>`.

2. **Local diff (always).** Read the baseline graph snapshot (`.norm/baseline.json` → `graph` `{ nodes, edges }`) and version fields. Compare the snapshot against the current local file tree — the simplest reliable check is to diff each prose/structured file's current content against what the baseline would produce (or just enumerate which files under `pathway/` have changed since the baseline was written). Report:
   - the active `pathway_id`,
   - the local working version — `working_version_number` (the in-place commit target) if the pathway has been committed, otherwise `production_version_number` with a note that the first `/norm:commit` will fork a working version,
   - the workspace `path` and node/file count,
   - `dirty` — whether there are uncommitted local edits, and which files changed.

3. **Server drift (`--server` only).** If `$ARGUMENTS` contains `--server`, fetch the live graph with `bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }`, unwrap `.data`, and JSON-diff it against the baseline `graph` snapshot. This GET mirrors the **production** snapshot and is the same lightweight drift read `/norm:commit` uses — it is read-only and needs no confirmation. Report whether the **server is ahead** of the baseline (someone else committed/published since clone). For a precise diff against the exact working version Norm commits into, read the canonical graph with `call_bland_api` `{ method: "POST", path: "/v1/convo_pathway/get_one", body: { id: "<pathway_id>", version_number: <working_version_number or production_version_number> } }` (a non-mutating POST read) and compare `.data.data.{nodes,edges}` — this matches the commit target version exactly, whereas `GET /v1/pathway/<id>` only ever reflects production.

4. **Call out drift as a stop signal.** If the server is ahead of the baseline, tell the user to re-clone via `/norm:clone <pathway_id>` and re-apply in-progress prose edits before validating or committing. Do not hand-merge.

5. **Nudge on dirty.** If `dirty` is true, remind the user to `/norm:validate` then `/norm:commit` to persist — an uncommitted local workspace is not a saved pathway.

Keep the report concise: pathway id, local version, server-drift status (if `--server`), dirty status, and the single most useful next command.
