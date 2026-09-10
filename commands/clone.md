---
description: List Bland pathways, clone one into a local file workspace, or scaffold a brand-new one. Use when the user wants to see, browse, or search their pathways, look up a pathway id by name, checkout, pull, download, open, or start editing an existing pathway (by id or name), or create/scaffold a new pathway from scratch.
argument-hint: "[pathway_id | new <name> | <name-filter>]"
allowed-tools:
  - "mcp__bland__*"
  - "mcp__plugin_bland_bland__*"
  - "Read"
  - "Write"
  - "Glob"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" generate:*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\" rebuild:*)"
---

# Clone Bland Pathway

Check out a pathway from the live Bland server into the canonical local workspace, or scaffold a new empty pathway. The local files under `pathway/` ARE the editing surface — clone materializes them; you then edit them natively and `/bland:commit` reconstructs the JSON and POSTs it.

Argument: `$ARGUMENTS` — either an existing `pathway_id`, or `new <name>` to begin a fresh pathway.

The API key lives in the MCP connection; it is never handled here or placed on a command line. The bundled `norm-sync.cjs` codec is OFFLINE and networkless — all server I/O is the MCP passthrough.

Steps:

1. **Resolve the argument.**
   - No argument, or a name/substring that is not a pathway id → **list** pathways (step 1a) and stop.
   - A bare id → clone that existing pathway (step 2).
   - `new <name>` → first create the shell, then clone it (step 3), then continue with step 2's materialization.

   1a. **List.** Call `bland_api_get` with `{ path: "/v1/pathway" }` — the LIST endpoint is `/v1/pathway` (singular). Do NOT use `/v1/pathways` (it 404s). Unwrap the `{ data: … }` envelope and read the `data[]` array. This is a read-only GET and needs no confirmation. If a filter was given, only show pathways whose `name` or `id` matches it, and note the filter applied. Render a compact list: `name` — `pathway_id` — current version — last updated. `Glob`/`Read` the local baseline at `.norm/baseline.json` (written on clone); if it exists, flag the matching entry as the locally cloned workspace. If the GET fails because auth is missing or invalid, say exactly that and point the user at the setup skill; do not invent pathway entries. End by suggesting `/bland:clone <pathway_id>` to start editing, or `/bland:clone new "<name>"` to create a fresh pathway.

2. **Read the graph + version metadata (existing pathway).** Three reads, all read-only (no confirmation):
   - **Production pointer + metadata:** `bland_api_get` `{ path: "/v1/pathway/<pathway_id>" }`. Unwrap `.data` — `{ name, description, nodes, edges, production_version_number, … }`. Use this for `name`/`description` and `production_version_number`. (The graph here is the **production** mirror, stripped of canvas-layout keys — fine as a baseline snapshot/drift reference, but do NOT treat it as the canonical editable graph.) If the GET fails because the id is unknown or auth is missing, say exactly that and stop; do not invent a workspace.
   - **Canonical editable graph:** `call_bland_api` `{ method: "POST", path: "/v1/convo_pathway/get_one", body: { id: "<pathway_id>", version_number: <production_version_number> } }`. (`get_one` is a read, but it is a POST on the convo_pathway router; it does NOT mutate.) Unwrap `.data.data` — full `{ nodes, edges, version_number, version_name, memory_enabled, entity_schemas }` with no field stripping. This is what you materialize the workspace from.
   - **Versions list (only source of `revision_number`):** `bland_api_get` `{ path: "/v1/pathway/<pathway_id>/versions" }`. Unwrap `.data` — an array of `{ id, version_number, revision_number, created_at, name, source_version_number, … }`. Capture the production version row's `revision_number`. `get_one` and `GET /v1/pathway/<id>` do NOT return `revision_number`; this list is the only read that does.

3. **Scaffold a new pathway (when `$ARGUMENTS` begins with `new`).** This is a state-changing write — get explicit user confirmation first. Then call `call_bland_api` with `{ method: "POST", path: "/v1/convo_pathway/create", body: { name: "<name>", description: "<description>" } }`. The save router is `/v1/convo_pathway`, NOT `/v1/pathway` (the latter hits the SMS router and 400s). Read the new `pathway_id` from the response: current builds return `data.pathway_id` (older ones returned `data.id`; accept either). A freshly created pathway is NOT empty — the server seeds it with the default three-node template (Start, New Node, End call, ids like `randomnode_<ts>`), production version 1, and a staging version 2. Treat it like an existing pathway from here: leave `working_version_number`/`working_revision_number` unset in the baseline so the first `/bland:commit` forks a working version via `create-version` from version 1, then read the graph per step 2 and materialize it. Rewrite the template's placeholder prompts and edge labels; they are not meant to ship.

4. **Materialize the readable workspace.** Write the unwrapped editable graph JSON (from `get_one` for an existing pathway; the create/get graph for a new one) to a scratch file with native `Write` at `.norm/_server.json` (OUTSIDE `pathway/` — `generate` wipes its out-dir before writing, so a scratch file under `pathway/` would be deleted). Then run the offline codec to expand the tree:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" generate .norm/_server.json pathway/
   ```

   Read its `ok` JSON stdout: report `files_written`, `nodes`, `edges`, and `name`. The tree it writes is described in `bin/SYNC.md` — `nodes/<slug>/node.md` (prose body + frontmatter), `condition.md`, `variables.yaml`, `model.yaml`, `tools.yaml`, `edges/<src>-to-<tgt>.md`, `.pathways/global_prompt.md`.

5. **Record the baseline.** Write `.norm/baseline.json` with native `Write` (OUTSIDE `pathway/`, so a later re-clone's `generate` wipe never clobbers it). `/bland:status` and `/bland:commit` diff the local tree against this baseline and read its version fields to target the right save call — without it, drift detection and commit have nothing to work from. Record exactly the fields `/bland:commit` needs:

   ```json
   {
     "pathway_id": "<id>",
     "production_version_number": 5,
     "source_version_number": 5,
     "working_version_number": null,
     "working_revision_number": null,
     "post_call_actions": [],
     "graph": { "nodes": [ ... ], "edges": [ ... ] }
   }
   ```

   - `production_version_number` — from `GET /v1/pathway/<id>` (`.data.production_version_number`).
   - `source_version_number` — the version_number the first commit forks from; for an existing pathway set it to `production_version_number`.
   - `working_version_number` / `working_revision_number` — leave `null` on clone. `/bland:commit`'s first commit forks a working version via `create-version` and records the returned `version_number`/`revision_number` here; subsequent commits update it in place and bump `working_revision_number`.
   - `post_call_actions` — capture from the editable graph/version so the in-place `update` commit re-sends them (an `update` writes whatever it's given; omitting them drops actions).
   - `graph` — the editable `{ nodes, edges }` snapshot (from `get_one`) used for drift comparison.

6. **Guard against clobbering.** If `pathway/` already exists and holds uncommitted edits (a dirty tree per `/bland:status`), warn the user before overwriting — do not silently clobber in-progress work.

The editable surface is the prose in `node.md` / `condition.md` / edge labels / `.pathways/global_prompt.md`. Structured surfaces (variables, model, tools, type-specific node config) are JSON-inlined in the file frontmatter/YAML and round-trip verbatim through `rebuild` — edit them in the files; they are persisted as part of the `{ nodes, edges }` body on commit via `call_bland_api` to `/v1/convo_pathway/create-version` (first commit) or `/v1/convo_pathway/update` (subsequent), not through any per-surface tool. After a clean clone, the workspace is ready for edits, then `/bland:validate` and `/bland:commit`.
