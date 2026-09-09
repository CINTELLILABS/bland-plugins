---
description: Show the current Bland workspace state — active pathway, working version, local vs server drift, dirty files, pending warnings — or, with --check, self-test the plugin install in this environment (MCP connection, tool namespace, config, every read surface). Use when the user asks what pathway is loaded, whether there are unsaved/uncommitted changes, whether local files differ from the server, asks for status, or wants to verify the install works after setup, a key or server switch, or on a new machine.
argument-hint: "[--server | --check]"
allowed-tools:
  - "mcp__bland__*"
  - "mcp__plugin_bland_bland__*"
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\")"
---

# Bland Workspace Status

Report the state of the local pathway workspace and whether it is in sync with the live server. A `--server` argument adds a live drift check; without it the report is a fast, zero-network local diff.

Steps:

1. **Locate the workspace and baseline.** `Glob` `pathway/` for the file tree and read the baseline at `.norm/baseline.json` (written on clone/commit). If there is no `pathway/` tree or no baseline, no pathway is mounted — say so and point the user at `/bland:clone` (no argument) then `/bland:clone <pathway_id>`.

2. **Local diff (always).** Read the baseline graph snapshot (`.norm/baseline.json` → `graph` `{ nodes, edges }`) and version fields. Compare the snapshot against the current local file tree — the simplest reliable check is to diff each prose/structured file's current content against what the baseline would produce (or just enumerate which files under `pathway/` have changed since the baseline was written). Report:
   - the active `pathway_id`,
   - the local working version — `working_version_number` (the in-place commit target) if the pathway has been committed, otherwise `production_version_number` with a note that the first `/bland:commit` will fork a working version,
   - the workspace `path` and node/file count,
   - `dirty` — whether there are uncommitted local edits, and which files changed.

3. **Server drift (`--server` only).** If `$ARGUMENTS` contains `--server`, fetch the live graph with `bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }`, unwrap `.data`, and JSON-diff it against the baseline `graph` snapshot. This GET mirrors the **production** snapshot and is the same lightweight drift read `/bland:commit` uses — it is read-only and needs no confirmation. Report whether the **server is ahead** of the baseline (someone else committed/published since clone). For a precise diff against the exact working version Norm commits into, read the canonical graph with `call_bland_api` `{ method: "POST", path: "/v1/convo_pathway/get_one", body: { id: "<pathway_id>", version_number: <working_version_number or production_version_number> } }` (a non-mutating POST read) and compare `.data.data.{nodes,edges}` — this matches the commit target version exactly, whereas `GET /v1/pathway/<id>` only ever reflects production.

4. **Call out drift as a stop signal.** If the server is ahead of the baseline, tell the user to re-clone via `/bland:clone <pathway_id>` and re-apply in-progress prose edits before validating or committing. Do not hand-merge.

5. **Nudge on dirty.** If `dirty` is true, remind the user to `/bland:validate` then `/bland:commit` to persist — an uncommitted local workspace is not a saved pathway.

Keep the report concise: pathway id, local version, server-drift status (if `--server`), dirty status, and the single most useful next command.

## `--check`: environment self-test

When `$ARGUMENTS` contains `--check`, skip the workspace report and run the checks below IN ORDER, continue past failures (never stop at the first), and end with the pass/fail matrix. Everything is a free read: no calls placed, no writes, no confirmations needed. This exists because bugs live in environment differences — Claude Code version, install path, org data shape, server target — that a single machine cannot expose.

1. **Namespace** — determine which prefix this session's Bland tools carry: `mcp__bland__*` or `mcp__plugin_bland_bland__*` (both are supported; report which one is live). If NEITHER exists, the MCP connection is down: report it, run check 2 anyway (the URL often explains it), then skip to the matrix.
2. **Config** — `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"` → report the target URL (prod vs a dev/localhost server) and that the key is stored separately. Never echo any key.
3. **Auth + account** — `bland_api_get { path: "/v1/me" }` → expect account JSON; report the org context it reflects.
4. **Calls read** — `bland_api_get { path: "/v1/calls", query: { limit: "1" } }` → expect a call (or a clean empty list on a fresh org). Keep the returned call id for check 8.
5. **Compiler, both directions** — `validate_pathway` on a tiny VALID 2-node graph (Default start → End Call, one edge) expecting `valid: true`, then on a BROKEN graph (single non-start node, no edges) expecting `valid: false` with named errors. A compiler that can't fail is not a pass.
6. **Contracts** — `get_pathway_schema { surface: "edge" }` and `get_pathway_context` (`scope: "pathway"`) on the tiny valid graph → expect a schema and a context summary.
7. **Analytics** — `query_analytics` with `{ table: "calls", metrics: [{ fn: "count", label: "calls" }], date_range: { since: "-7d" } }` → expect a numeric row (0 is a pass on a quiet org).
8. **get_call_log** — on the call id from check 4 (skip with a note if the org has no calls) → expect the call's transcript/metadata. A "not found" for an id that check 4 just returned is a KNOWN bug signature — flag it loudly with both results side by side.
9. **Docs** — `search_bland_docs` for "send call" → expect results (a docs-proxy outage degrades this without breaking anything else; report it as degraded, not failed).
10. **Error-path hygiene** — `bland_api_get { path: "/v1/does-not-exist-bland-check" }` → expect a clean 404 error, and then repeat check 4 to prove the session was not poisoned by it.

End with a matrix: `# | check | PASS/FAIL/DEGRADED/SKIPPED | evidence (one line, verbatim errors)`. Then a one-line verdict: fully healthy / degraded (what still works) / broken (the first thing to fix — usually URL or key; see the setup skill, then restart). For any FAIL, include the exact tool call + response so the matrix doubles as a bug report.
