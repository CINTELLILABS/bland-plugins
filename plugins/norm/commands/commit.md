---
description: Commit the local pathway workspace back to the Bland server as a new working version (promoting production for new pathways). Use when the user wants to save, persist, push, upload, publish, or sync their pathway changes to the server.
argument-hint: "[--force]"
allowed-tools:
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__bland__validate_pathway"
  - "Read"
  - "Write"
  - "Glob"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
---

# Commit Bland Pathway Workspace

Persist the current local workspace to the live Bland server. This is the real persistence boundary — a clean local file tree is not a saved pathway. Every write here is a `call_bland_api` POST and must be confirmed with the user before firing.

**Save endpoints (read this first).** Pathway saves go to the **`/v1/convo_pathway`** router, NOT `/v1/pathway/<id>`. `POST /v1/pathway/<id>` hits the SMS router and 400s — it is NOT a save endpoint. Never reintroduce it. The save surface is:

- `POST /v1/convo_pathway/create-version` — **forks a NEW working version** from a baseline. Body `{ id, name, nodes, edges, source_version_id }` where `source_version_id` is a **version_number** (the handler resolves it to a row id). Returns `{ version_number, revision_number, id, name, created_at }`.
- `POST /v1/convo_pathway/update` — **updates a working version IN PLACE** (the canonical iterative commit). Body `{ id, version_number, nodes, edges, post_call_actions, revision_number }`. `version_number` stays fixed; `revision_number` auto-increments server-side. Append `?force=true` to override the optimistic-concurrency stop (409 OLD_REVISION_ERROR) since Norm is the sole writer.
- `POST /v1/convo_pathway/publish` — promotes a working version to production. Body `{ id, version_number, environment: "production", run_tests: false }`.

**Editing model = fork once, then update in place.** The first commit on a freshly cloned pathway forks a working version (`create-version`); every subsequent commit updates that same `version_number` in place (`update`). This is the console's exact pattern and is what avoids version explosion. All bodies are native JSON objects (the server `JSON.stringify()`s them) — never a stringified body.

Optional argument: `$ARGUMENTS` — pass `--force` only to override a drift stop after the user has confirmed they want to overwrite newer server state.

Steps:

1. **Validate first.** The workspace should already validate clean. If you are unsure, run `/norm:validate` and resolve all errors before committing. Do not commit a workspace with structural errors. The authoritative validation is `mcp__bland__validate_pathway` (the server compiler) — you will also run it directly on the rebuilt graph in step 4a below as the hard pre-commit gate.

2. **Read the baseline + drift check.** Read `.norm/baseline.json` (written on clone). It carries `pathway_id`, `production_version_number`, `working_version_number`, `working_revision_number`, and `source_version_number`. Re-fetch the current server graph for drift with `mcp__bland__bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }`, unwrap `.data`, and compare it to the baseline graph snapshot. If the server moved ahead since clone, STOP: tell the user the workspace is stale, do not POST, and re-clone via `/norm:clone <pathway_id>` before re-applying edits — unless `--force` was passed AND the user has explicitly confirmed they want to overwrite the newer server state. Never force silently. (`GET /v1/pathway/<id>` mirrors the **production** snapshot and is fine as a lightweight drift/production-pointer read; it is NOT the editing source.)

3. **Reconstruct the graph.** Run the offline codec to rebuild `{ nodes, edges }` from the local file tree. It prints the raw graph JSON on stdout (NOT the `{ ok, … }` envelope), in the exact POST shape — edge `label`/`description` are emitted at the top level per edge:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" rebuild pathway/
   ```

4. **Compile the rebuilt graph — hard pre-commit gate (`validate_pathway`), CHANGE-AWARE.** Before any save POST, run the authoritative server compiler on the rebuilt `{ nodes, edges }`, passing the pre-edit graph from `.norm/baseline.json` (you already read it in step 2 — the graph is at `.graph`, or top-level on a loop-written baseline) as `baseline` so the compiler diffs your edit against it. Object bodies only (native JSON, never stringified):

   ```
   mcp__bland__validate_pathway {
     nodes: <rebuilt nodes>,
     edges: <rebuilt edges>,
     baseline: { nodes: <baseline nodes>, edges: <baseline edges> }
   }
   ```

   If `.norm/baseline.json` is missing or has no usable graph, OMIT `baseline` and fall back to whole-graph validation (call with just `{ nodes, edges }`).

   (This is a read-only compile — no confirm-gate.) If it returns `valid: false`, **STOP: do NOT commit a graph the compiler rejects.** Fix each reported `error` on the correct file surface (prompt/condition/global-prompt/edge-label prose, or `variables.yaml`/`model.yaml`/`tools.yaml`/node frontmatter), **prioritizing `introduced_errors` — those are the ones your edit broke** — `rebuild` again, and re-compile (re-passing `baseline`) — repeat until `valid: true`. Act on the change-relevant results first: `introduced_warnings` and `runtime_contract_findings` where `relevant_to_changes: true` are [NEW FROM YOUR CHANGES] — address them before committing; pre-existing warnings/findings are secondary. Keep `warnings` + `runtime_contract_findings` + the `validation_delta_summary` (when a baseline was passed) visible in the final report (advisory, not blocking). If `mcp__bland__validate_pathway` is unavailable (older server), fall back to `/norm:validate`'s offline structural pre-check as the gate and note that the authoritative compile did not run. Only once the graph compiles clean, proceed to the save POST.

5. **Commit the graph (confirm-gated).** Two cases, both writing the rebuilt `{ nodes, edges }`:

   - **First commit on this clone — fork a working version.** If `.norm/baseline.json` has no `working_version_number` yet (a freshly cloned pathway you haven't committed), get explicit user confirmation, then call `mcp__bland__call_bland_api` with `{ method: "POST", path: "/v1/convo_pathway/create-version", body: { id: "<pathway_id>", name: "<working name>", nodes, edges, source_version_id: <source_version_number> } }`. Use `source_version_number` from the baseline (= the production version you forked from at clone). Record the returned `version_number` as `working_version_number` and `revision_number` as `working_revision_number` in `.norm/baseline.json` (a fresh fork is `revision_number: 1`).

   - **Subsequent commits — update in place.** If `working_version_number` is already recorded, get explicit user confirmation, then call `mcp__bland__call_bland_api` with `{ method: "POST", path: "/v1/convo_pathway/update?force=true", body: { id: "<pathway_id>", version_number: <working_version_number>, nodes, edges, post_call_actions: <baseline post_call_actions>, revision_number: <working_revision_number> } }`. Pass the `post_call_actions` you captured at clone (omitting/passing `undefined` writes nothing new, but the field IS written — pass what you read so you don't drop actions). `?force=true` is intended because Norm is the sole writer; the mutex on `${id}:${version_number}` may return 423 LOCK_NOT_ACQUIRED under contention — retry shortly. On success, **bump `working_revision_number` += 1** in `.norm/baseline.json` for the next commit (the server increments `revision_number` by 1 on every update).

   `update` and `create-version` do NOT run `validatePathway()` inline — the authoritative compile is `mcp__bland__validate_pathway`, which you already ran as the hard gate in step 4. If a commit POST still returns an error envelope (server-side rejection the compiler could not see), surface it verbatim; localize each to a file surface (prompt prose, condition prose, edge label, variables/model/tools YAML), fix in the local files, `rebuild`, re-compile (step 4), and re-commit.

6. **Publish (confirm-gated, only when promoting).** Promoting to production is a separate, high-impact write — never auto-publish an edit unless the user asked to promote. For a brand-new pathway, the user must explicitly confirm the first production promotion. Get explicit user confirmation, then call `mcp__bland__call_bland_api` with `{ method: "POST", path: "/v1/convo_pathway/publish", body: { id: "<pathway_id>", version_number: <working_version_number>, environment: "production", run_tests: false } }`. `version_number` is the **working** version_number (not a row id). Publish creates a NEW frozen production snapshot (max version_number + 1), advances `production_version_number`, and leaves your working version intact. Pass `run_tests: false` to publish synchronously (200) and skip the gate; if you omit it and gate scenarios exist, publish returns **202 (tests RUNNING)** and auto-publishes only on pass (async) — report that state rather than claiming production changed.

7. **Handle a saved-but-not-promoted state.** If the working-version commit (`create-version`/`update`) succeeds but publish fails, report exactly that: the working version was saved but production was NOT promoted. Offer to retry the publish; do not claim production changed.

8. **Refresh the baseline.** On a clean commit, persist the updated version fields (`working_version_number`, bumped `working_revision_number`, and after a publish the advanced `production_version_number`) and re-snapshot the committed graph into `.norm/baseline.json` with native `Write`, so `/norm:status` reflects the newly committed state. Re-read the canonical graph via `POST /v1/convo_pathway/get_one` `{ id: "<pathway_id>", version_number: <working_version_number> }` (full editable graph) for the baseline snapshot; if you also need a refreshed `revision_number`, read `GET /v1/pathway/<pathway_id>/versions` (the only read that returns `revision_number`).

Report the persisted `pathway_id`, the working `version_number` and its `revision_number`, whether production was promoted (only say "production changed" if a publish actually succeeded — a 202 means tests are running, not promoted), the `validate_pathway` compile status (`valid` true/false, plus any commit-POST error envelope), the **change-relevant results first** (`introduced_errors`/`introduced_warnings` and `runtime_contract_findings` where `relevant_to_changes: true`, plus the `validation_delta_summary` counts, when a baseline was passed — else note "whole-graph, no baseline"), and any remaining pre-existing warnings, runtime-contract findings, or placeholder values the user must replace. Do not ask "should I save it?" after a clean validation pass — committing is the expected final step of any create/edit/fix request.
