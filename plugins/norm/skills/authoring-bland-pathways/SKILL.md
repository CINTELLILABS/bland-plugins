---
name: authoring-bland-pathways
description: Use whenever the user wants to create, edit, fix, test, simulate, debug, publish, or inspect a Bland voice/phone agent or conversational pathway. Triggers include any mention of "pathway", "node", "node prompt", "call flow", "phone agent", "voice agent", "global prompt", "simulate a call/chat", a Bland pathway id, or files under pathway/. Not for reviewing real call recordings (/norm:review), personas (/norm:persona), eval scoring (/norm:evals), or analytics (/norm:analytics).
---

# Authoring Bland Pathways

A Bland pathway is worked on as a **local workspace of files** (the canonical engine layout, below). The files on disk are the source of truth you edit; persistence to the server happens on **commit**, which reconstructs the pathway JSON from the files and POSTs it through the Bland MCP passthrough.

- **Everything is authored in local files** — node prompts, conditions, edge labels, the global prompt, AND the structured surfaces (variables, model config, node tools, unit tests) are all edited directly in `pathway/` with native `Read` / `Write` / `Edit` / `Glob` / `Grep`. Prose lives in markdown bodies; structured config lives in YAML / JSON-inlined frontmatter.
- **Validation and persistence go through the `/norm:*` commands** — which call the Bland MCP passthrough (`bland_api_get` to read, `call_bland_api` to write) against the documented `/v1/pathway/*` REST endpoints. `/norm:clone`, `/norm:validate`, `/norm:test`, and `/norm:commit` are the boundary; the offline `norm-sync.cjs` codec is the glue that turns the GETted JSON into files and the files back into JSON.

Edit structured YAMLs carefully — they are typed config persisted verbatim as part of the graph. Do not treat a clean local file tree as a saved pathway — only a commit persists.

## Canonical workspace layout (match exactly)

```
nodes/<slug>/node.md          # frontmatter (id, type, name, [isStart]) + body = node prompt   [PROSE: native edit]
nodes/<slug>/condition.md     # optional — body = routing condition                            [PROSE: native edit]
nodes/<slug>/variables.yaml   # optional — { variables: [{ name, type, description }] }         [STRUCTURED: edit carefully]
nodes/<slug>/model.yaml       # optional — model options map                                    [STRUCTURED: edit carefully]
nodes/<slug>/tools.yaml       # optional — { tools: [...] }                                     [STRUCTURED: edit carefully]
nodes/<slug>/unit-tests.yaml  # optional — per-node test scenario                               [STRUCTURED: edit carefully]
nodes/<slug>/tag.yaml         # optional — { name, color }
edges/<srcSlug>-to-<tgtSlug>.md   # frontmatter (id, source, target, sourceName, targetName) + body = label   [PROSE body: native edit]
.pathways/global_prompt.md    # raw markdown, NO frontmatter — the global/system prompt          [PROSE: native edit]
.pathways/layout.yaml         # { positions: { <slug>: { x, y } } }                              [AUTO-DERIVED: never touch]
.pathways/config.yaml         # reserved; emitted as `{}`
```

- `slug` = first 8 hex chars of the node's UUID `id` (`id.replace(/-/g,"").slice(0,8)`), stable across renames; `node.md` frontmatter carries the full UUID.
- Exactly one start node (`isStart: true`). Every node reachable from it.
- No `manifest.yaml` on disk — it is rebuilt live from node/edge files at compile time.
- `.pathways/global_prompt.md` has no frontmatter; adding `---` corrupts it.
- `.pathways/layout.yaml` is auto-derived — never read it for meaning, never write it.
- YAML scalar gotcha: a slug shaped `<digits>e<digits>` (e.g. `631e5943`) must be quoted wherever it is a YAML scalar value or map key — structured YAMLs are JSON-inlined for exactly this reason, so keep that inlining intact when you hand-edit.

## Surface routing (which file for which edit)

| You are changing… | Surface | How |
|---|---|---|
| a node prompt | `nodes/<slug>/node.md` body | native `Edit`/`Write` |
| a routing condition | `nodes/<slug>/condition.md` body | native `Edit`/`Write` |
| an edge label | `edges/<src>-to-<tgt>.md` body | native `Edit`/`Write` |
| the global prompt | `.pathways/global_prompt.md` | native `Edit`/`Write` |
| variables | `nodes/<slug>/variables.yaml` | native `Edit`/`Write` (keep the YAML shape; persisted on commit) |
| per-node model | `nodes/<slug>/model.yaml` | native `Edit`/`Write` (keep the YAML shape; persisted on commit) |
| node tools | `nodes/<slug>/tools.yaml` | native `Edit`/`Write` (keep the YAML shape; persisted on commit) |
| per-node unit tests | `nodes/<slug>/unit-tests.yaml` | native `Edit`/`Write` (keep the YAML shape; persisted on commit) |
| node positions | `.pathways/layout.yaml` | never — auto-derived |
| clone / validate / test / commit | server, via MCP passthrough | `/norm:*` commands |

Structured edits are persisted by editing the file and committing — the `/norm:commit` flow reconstructs `{ nodes, edges }` from the tree, gates it on `mcp__bland__validate_pathway` (the server compiler), and POSTs it to `/v1/convo_pathway/*`. Keep structured YAML well-formed (the JSON-inlined frontmatter must stay parseable) or `/norm:validate` and the commit POST will reject it.

## New pathway

1. Create the shell and clone the workspace (the create flow under `/norm:*`: `call_bland_api POST /v1/convo_pathway/create`, then `/norm:clone`).
2. Author the minimal complete flow as **prose files**: start `node.md`, core task nodes, fallback/transfer when needed, an ending behavior, `condition.md` routes, edge labels, and `.pathways/global_prompt.md`.
3. Add **structured** surfaces by editing the YAML files: `variables.yaml`, `model.yaml`, `tools.yaml`, `unit-tests.yaml`.
4. Validate (`/norm:validate` — offline structural pre-check).
5. Fix validation errors and re-validate.
6. Test when useful: Agent-to-Agent Testing for full simulated conversations; Test Bed for focused node/runtime checks.
7. Commit after validation errors are resolved (`/norm:commit` — POSTs the graph; the POST response is the authoritative validation).

## Existing pathway

1. List/get the pathway if the target or version is unclear (`/norm:list`, then `/norm:clone <id>`). If the server may be ahead, re-clone first (see Drift).
2. Gather the dependency picture before editing routing, transfer, fallback, or tool behavior: read the cloned workspace files (nodes, edges, conditions, tools) to see how the affected node connects, and use real runtime evidence (`/norm:review` → `get_call_log`) when a live call is in question.
3. Apply the smallest correct edit on the correct surface (prose → markdown body; structure → the matching YAML).
4. Validate, fix errors, test when useful, then commit.

## Validation and commit

- Run validation after meaningful structural or prose changes; fix **errors** before tests or commit. `/norm:validate` is an offline structural pre-check (start node / reachability / edge endpoints / well-formed YAML / round-trip) — fast, but not authoritative.
- The **authoritative** validation is `mcp__bland__validate_pathway` — the server compiler — run on the rebuilt graph (change-aware with the `.norm/baseline.json` graph) before the save POST. Saves go to `POST /v1/convo_pathway/create-version` (first commit forks a working version) or `POST /v1/convo_pathway/update?force=true` (in place) — never `POST /v1/pathway/:id`, which is the SMS router and 400s. The POST may still surface a server error the compiler could not see; surface it back to the originating file.
- Keep **warnings** visible and explain them. Missing End Call is advisory — don't add a node just to silence it.
- After a clean validation pass, commit in the same run. Never ask "should I save it?" after clean validation.
- New-pathway commits promote to production (`POST /v1/convo_pathway/update` followed by `POST /v1/convo_pathway/publish`). Edit commits save a working version without promoting production — don't claim production changed unless the result says so. If publish fails after a successful upsert, report "saved but not promoted" and offer a retry (the two calls are not atomic).
- A clean local file tree is not a saved pathway. The commit is the real persistence boundary; never describe an uncommitted workspace as finished.

## Simulation and testing

- For "simulate a conversation", "test chat", or end-to-end verification, drive the Claude-native Pathway Chat simulation via `/norm:test` (no node): `POST /v1/pathway/chat/create` then per-turn `POST /v1/pathway/chat/<chat_id>` until `completed: true` — you play the caller and judge the transcript. `/norm:loop` wraps this in an evaluator-optimizer convergence run. Reserve `create_eval_run`/`get_eval_run` for `/norm:evals` scoring of REAL calls by call_id.
- For one node, webhook, prompt, route, extraction, or seeded-call behavior, use Test Bed: a focused runtime check — `/norm:test <node>`, or seed a real call (`create_call`, confirm-gated) and inspect it with `get_call_log` / `/norm:review`.
- Do not hand-simulate or call external webhooks manually when these flows are available.
- Do not claim a test passed until a Bland result surface (eval run status/scores, call transcript/decision logs) returns the outcome.

## Debugging

1. Reproduce or locate the failure with runtime evidence (`/norm:review` → call log, a seeded node test, or an eval run) — not by re-reading prose and guessing.
2. Form the dependency picture from the cloned workspace files (how the node routes, what it extracts, which tools it calls) plus the runtime evidence.
3. Localize the defect to one surface (prompt / condition / edge label / tools / variables / model).
4. Apply the smallest fix on that surface (prose → native body edit; structure → the matching YAML, kept well-formed).
5. Re-validate and re-test the same way you reproduced the bug before claiming a fix.

## Drift

The local workspace is a checkout at a point in time. If the live server version is ahead — another editor changed the pathway, a prior commit promoted a new version, or `/norm:status --server` reports a newer version — **re-clone before editing further**. Treat a version mismatch as a stop-and-re-clone signal, not something to force. Drift is detected by a fresh `bland_api_get /v1/pathway/:id` diffed against the baseline JSON written on clone. Re-clone via `/norm:clone`, re-apply in-progress prose edits on top of the fresh files, then re-validate. When unsure whether the workspace is current, run `/norm:status --server` before editing.

## High-impact actions

Before any real outbound call/message, delete, publish, promote, cancellation, or tag application, ask the user for explicit confirmation. Every server write through the passthrough (`call_bland_api` POST/PUT/PATCH/DELETE, `create_call`, `create_eval_run`) is confirm-gated. Simulations, validation, and read-only inspections (`bland_api_get`) do not need it.
