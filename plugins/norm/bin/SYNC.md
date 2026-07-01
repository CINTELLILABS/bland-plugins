# norm-sync — offline pathway codec

`norm-sync.cjs` is an **offline, networkless** JSON ↔ files codec. It transforms a
Bland pathway between the server JSON shape (`{ nodes, edges }`) and a canonical
local file tree of Markdown/YAML, and runs an offline structural pre-check. It has
**no network and no credentials** — it never reaches the Bland server.

```
node bin/norm-sync.cjs <generate|rebuild|validate> [args]
```

## The editing model (locked architecture)

**The local files ARE the workspace** — the real, source-of-truth editing surface.
The agent clones a pathway into `pathway/`, edits the files natively
(`Read` / `Write` / `Edit` / `Glob` / `Grep`), and commits by reconstructing the
JSON from the files and POSTing it. The files are not a "scratch view"; they are
where the work happens.

**All network I/O is the MCP passthrough.** Every read/write against the Bland
server goes through the MCP tools driven from the `/norm:*` command + agent bodies:

- **Reads:** `mcp__bland__bland_api_get` (GET) against documented `/v1/*` endpoints.
- **Writes:** `mcp__bland__call_bland_api` (POST/PUT/PATCH/DELETE) — always behind a
  confirmation gate (see Confirm-gating).

`norm-sync.cjs` is the offline glue between those calls and the local files:
- on **clone**, the agent reads the canonical graph (`POST /v1/convo_pathway/get_one`)
  and runs `generate <json> <dir>` to write the readable file tree;
- on **commit**, the agent runs `rebuild <dir>` to reconstruct `{ nodes, edges }`
  from the files and POSTs it to the **`/v1/convo_pathway`** save router
  (`create-version` to fork a working version, then `update` in place) — NOT to
  `POST /v1/pathway/:id`, which is the SMS router and 400s;
- `validate <dir>` is an offline structural pre-check before commit.

The script holds NO key. The API key lives only in the MCP connection
(`.mcp.json`: `Authorization: Bearer ${user_config.bland_api_key}`) and is not
readable from a Bash subprocess — which is exactly why the old Bash→REST adapter
was dead and was removed. (`_credentials.cjs` remains only for the desktop stdio
bridge `bland-mcp-proxy.cjs` / `bland-mcp-desktop`; no command/agent body uses it.)

## Layout

```
pathway/                       # editable working tree (the source of truth)
  nodes/<slug>/node.md         #   <slug> = first 8 hex of node UUID (stable on rename)
  nodes/<slug>/condition.md    #   optional — routing condition (prose body)
  nodes/<slug>/variables.yaml  #   optional — extractVars
  nodes/<slug>/model.yaml      #   optional — model options
  nodes/<slug>/unit-tests.yaml #   optional — per-node unit tests
  nodes/<slug>/tag.yaml        #   optional — { name, color }
  nodes/<slug>/tools.yaml      #   optional — node-attached tools (TON)
  edges/<src>-to-<tgt>.md      #   edge label (body) + endpoints (frontmatter)
  .pathways/config.yaml        #   derived
  .pathways/layout.yaml        #   derived (node x/y)
  .pathways/global_prompt.md   #   prose — the global/system prompt
```

The agent also writes a **baseline** copy of the just-GETted JSON (native `Write`)
so `/norm:status` and `/norm:commit` can diff local vs. baseline without a
credentialed pull — drift is detected by a fresh `bland_api_get` + JSON diff.

## Subcommands (all offline)

### `generate <pathway.json> <out-dir>`
Read a pathway JSON file (`{ nodes, edges }` — a `{ data: … }` envelope is also
accepted) and write the canonical tree under `<out-dir>`. The directory is cleaned
first. Used on **clone**: the agent reads the canonical graph via
`POST /v1/convo_pathway/get_one` `{ id, version_number }` through the passthrough
(unwrapping `.data.data`), saves the unwrapped body to a temp JSON file, then
`generate`s the readable tree. (`GET /v1/pathway/:id` returns only the lossy
production mirror — fine for a drift snapshot, not for the editable workspace.)

### `rebuild <dir>`
Read the tree under `<dir>` and print the rebuilt `{ nodes, edges }` JSON on
**stdout** (the raw graph, NOT the `{ ok, … }` envelope — so it pipes straight into
a POST body). Used on **commit**: `rebuild pathway/` → `call_bland_api`
`POST /v1/convo_pathway/create-version` (first commit, forks a working version) or
`POST /v1/convo_pathway/update` (subsequent, in place), both confirm-gated. NOT
`POST /v1/pathway/:id` (SMS router; 400s). Edge `label`/`description` are emitted at
the **top level** of each edge — see the GET/POST asymmetry below.

### `validate <dir>`
Offline structural pre-check over the tree under `<dir>`:
- every `node.md` frontmatter parses and carries an `id` + `type`;
- exactly one start node (zero is a warning — a fresh shell legitimately has none);
- every edge endpoint resolves to a known node;
- every node is reachable from the start node (warning);
- structured files (`condition.md` / `variables.yaml` / `model.yaml` /
  `unit-tests.yaml` / `tag.yaml` / `tools.yaml`) are well-formed;
- the tree round-trips (`rebuild` → `generate` reproduces the prose).

**`validate` is the pre-commit gate; the commit POST is the persistence boundary.**
The `/v1/convo_pathway` save routes (`create-version`, `update`) persist the graph
and return an error envelope on failure, but they do NOT run a full
`validatePathway()` the way the old (wrong) `POST /v1/pathway/:id` claim implied. So
treat the offline `validate` pre-check as the structural gate before committing, and
surface any error envelope the commit POST returns verbatim. A clean `validate` does
not guarantee the server accepts the commit (codec↔engine drift is possible), and
the server may reject a graph `validate` considered well-formed.

## Endpoints (called by the agent via the MCP passthrough — NOT by this script)

**Saves go to the `/v1/convo_pathway` router, never to `/v1/pathway/:id`.** `POST /v1/pathway/:id`
is the **SMS router** and 400s — it is NOT a pathway save endpoint and must never be
reintroduced. All request bodies are **native JSON objects** (the server `JSON.stringify()`s
them); never pass a pre-stringified body.

| Purpose | HTTP | Tool | Notes |
| --- | --- | --- | --- |
| list pathways | `GET /v1/pathway` | `bland_api_get` | **not** `/v1/pathways` (404s); response `.data[]` |
| read production mirror | `GET /v1/pathway/:id` | `bland_api_get` | `{ name, description, nodes[], edges[], production_version_number }`; **lossy** (production snapshot, strips canvas layout); use for metadata/drift only, NOT the editable graph |
| read canonical graph | `POST /v1/convo_pathway/get_one` | `call_bland_api` | body `{ id, version_number }`; non-mutating read; `.data.data` = full `{ nodes, edges, version_number, version_name, memory_enabled, entity_schemas }`; **no `revision_number`** |
| read versions/revision | `GET /v1/pathway/:id/versions` | `bland_api_get` | `.data[]` of `{ id, version_number, revision_number, source_version_number, … }`; **only** source of `revision_number` |
| create shell | `POST /v1/convo_pathway/create` | `call_bland_api` | `{ name, description? }` → `data.id` (the pathway id; **not** `pathway_id`) (confirm-gated) |
| fork working version | `POST /v1/convo_pathway/create-version` | `call_bland_api` | first commit; body `{ id, name, nodes, edges, source_version_id }` where `source_version_id` = a **version_number**; returns `{ version_number, revision_number, id, name }` (confirm-gated) |
| update in place | `POST /v1/convo_pathway/update?force=true` | `call_bland_api` | iterative commit; body `{ id, version_number, nodes, edges, post_call_actions, revision_number }`; `version_number` fixed, `revision_number` auto-increments; `?force=true` overrides 409 OLD_REVISION_ERROR (Norm is sole writer); mutex on `${id}:${version_number}` → 423 LOCK_NOT_ACQUIRED on contention, retry (confirm-gated) |
| publish | `POST /v1/convo_pathway/publish` | `call_bland_api` | body `{ id, version_number, environment:"production", run_tests:false }`; `version_number` = the **working** version_number; creates a NEW frozen snapshot + advances production; `run_tests:false` skips the test gate for synchronous 200 (omit → 202 tests RUNNING) (confirm-gated) |
| read call | `GET /v1/calls[/:id]` | `bland_api_get` / `get_call_log` | for `/norm:review`; feed payload to `generateCallFiles` offline |

### `{ data: … }` envelope
Every `bland_api_get` response is wrapped: unwrap `.data` before using the body.
`generate` also accepts a still-wrapped `{ data: { nodes, edges } }` for convenience.

### GET / POST edge asymmetry
`GET /v1/pathway/:id` nests edge `label`/`description` **under `edge.data`**; the
save POST (`POST /v1/convo_pathway/update` or `/create-version`) reads them at the
**top level** of each edge.
- `generate` accepts **both** shapes on input.
- `rebuild` always emits `label`/`description` **top-level**, so its output is the
  exact save-POST shape — pipe it straight into `call_bland_api` as the `nodes`/`edges`
  of the `update`/`create-version` body.

### Commit + promote (fork once, then update in place)
The console's pattern, which Norm follows: the **first** commit on a clone forks a
working version (`POST /v1/convo_pathway/create-version`, capturing the returned
`version_number`); **every subsequent** commit updates that same version in place
(`POST /v1/convo_pathway/update?force=true`, bumping `revision_number`). One working
version, growing `revision_number` — this is what avoids version explosion. Promotion
is a separate write: `POST /v1/convo_pathway/publish` `{ id, version_number,
environment:"production", run_tests:false }`, which creates a NEW frozen production
snapshot and advances `production_version_number`, leaving the working version intact.
There is no transaction across commit + publish: if publish fails after a successful
commit, the working version is saved but production is NOT promoted — report
"saved-but-not-promoted" and offer a publish retry.

## Per-file routing

Three classes:
**prose** (free-text, safe to hand-edit), **structured** (typed config, JSON-inlined
in frontmatter for lossless round-trip — edit carefully; it is persisted as part of
the graph on the commit POST), and **derived/layout** (regenerated server-side,
written for humans, ignored on rebuild).

| File | Surface | Class | On commit |
| --- | --- | --- | --- |
| `nodes/<slug>/node.md` body | node prompt / dialogue text | **prose** | rebuilt → graph |
| `nodes/<slug>/node.md` frontmatter `name`/`isStart`/`globalLabel` | node identity flags | prose-ish | rebuilt → graph |
| `nodes/<slug>/node.md` frontmatter `url`/`method`/`headers`/`tool`/`code`/`routes`/`kb`/… | type-specific node config | **structured** | passthrough (JSON-inlined) → graph |
| `nodes/<slug>/condition.md` body | routing condition prose | **prose** | rebuilt → graph |
| `nodes/<slug>/condition.md` frontmatter `conditionExamples` | few-shot examples | **structured** | passthrough |
| `nodes/<slug>/variables.yaml` | `extractVars` (name/type/description) | **structured** | passthrough |
| `nodes/<slug>/model.yaml` | model options | **structured** | passthrough |
| `nodes/<slug>/unit-tests.yaml` | node unit tests | **structured** | passthrough |
| `nodes/<slug>/tag.yaml` | node tag `{name,color}` | **structured** | passthrough |
| `nodes/<slug>/tools.yaml` | node-attached tools (TON) | **structured** | passthrough |
| `edges/<src>-to-<tgt>.md` body | edge label | **prose** | rebuilt → graph (top-level) |
| `edges/…md` frontmatter `description` | edge description | **prose** | rebuilt → graph (top-level) |
| `edges/…md` frontmatter `_sourceId`/`_targetId` | preserved UUIDs | structural | used to rebuild the graph exactly |
| `.pathways/global_prompt.md` | global system prompt | **prose** | rebuilt → globalConfig node |
| `.pathways/layout.yaml` | node x/y positions | **derived/layout** | skipped (server re-runs layout) |
| `.pathways/config.yaml` | placeholder config | **derived** | skipped |

Persistence is by **editing the local files and committing** — the structured
surfaces round-trip verbatim through `rebuild` and are persisted as part of the
`{ nodes, edges }` body of the `/v1/convo_pathway/create-version` or `/update` POST,
not via any per-surface tool.

## Known limitations

- **Conditional-edge `data.condition` arrays do not round-trip.** `rebuild` carries
  edge `id`/`source`/`target`/`label`/`description`; a richer `data.condition`
  array on an edge is dropped. This is a pre-existing lossy surface on both the
  server and the codec — if a conditional edge matters, patch it directly in the
  JSON you POST.
- **Codec ↔ server-engine drift.** If the server's `generator.ts` / edge-reshape
  logic changes, this offline codec can desync. The codec is a read/diff +
  reconstruct convenience; the authoritative graph is always the server's
  POST-validated result. Re-sync the codec if the server engine changes.

## Confirm-gating

Every write through the passthrough (`call_bland_api` POST/PUT/PATCH/DELETE,
`create_call`, `create_eval_run`) must be confirmed with the user before firing.
Read-only `bland_api_get` calls are never gated. High-impact actions — real
outbound calls/messages, deletes, publish/promote — always require explicit
confirmation.

## Error envelope

`generate` / `validate` print the standard envelope; `rebuild` prints the raw graph
JSON on success.

```json
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "…", "details": { … } } }
```

Common codes: `BAD_ARGS`, `NOT_FOUND`, `BAD_JSON`, `EMPTY_TREE`, `UNSAFE_PATH`,
`VALIDATION_FAILED`, `UNKNOWN_COMMAND`, `UNEXPECTED`.
