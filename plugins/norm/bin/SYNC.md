# norm-sync — Phase 4a sync engine (REST adapter, no-backend MVP spike)

A git-style sync engine between a Bland pathway (server JSON: `nodes` / `edges`) and a
canonical local file tree. It pulls a pathway into editable Markdown/YAML, lets you edit
prose locally, and pushes changes back as **one batched update call** with server-side
inline validation. All output is structured JSON on stdout; every command exits non-zero on
failure so callers can branch on `$?`.

```
node bin/norm-sync.cjs <clone|commit|validate|test|status|touch> [args]
```

## Layout

```
$CLAUDE_PROJECT_DIR/
  pathway/                     # editable working tree (materialized from server)
    nodes/<slug>/node.md       #   <slug> = first 8 hex of node UUID (stable on rename)
    nodes/<slug>/condition.md
    nodes/<slug>/variables.yaml
    nodes/<slug>/model.yaml
    nodes/<slug>/unit-tests.yaml
    nodes/<slug>/tag.yaml
    nodes/<slug>/tools.yaml
    edges/<src>-to-<tgt>.md
    .pathways/config.yaml       # derived
    .pathways/layout.yaml       # derived (node x/y)
    .pathways/global_prompt.md  # prose
  .norm/
    manifest.json              # pathway_id, transport, version, per-file sha256
    baseline/                  # snapshot of the last pulled tree (3-way merge base)
```

## Environment

| Var | Purpose | Fallback |
| --- | --- | --- |
| `BLAND_API_URL` / `CLAUDE_PLUGIN_OPTION_bland_api_url` | API base | `https://api.bland.ai` |
| `BLAND_API_KEY` / `CLAUDE_PLUGIN_OPTION_bland_api_key` | API key (sent as `Authorization: Bearer …`; bare key also accepted by the server) | — (required) |
| `CLAUDE_PROJECT_DIR` | where `pathway/` and `.norm/` live | `cwd()` |

Outbound calls are throttled to honor **120 req/min** (≥500 ms spacing). `429` and network
failures surface as structured `RATE_LIMITED` / `NETWORK_ERROR` errors.

## Subcommands

### `clone <id>` / `clone --new "<name>"`
- `clone <id>` → `GET /v1/pathway/:id`, materialize the canonical tree, write
  `.norm/manifest.json` (per-file sha256) + `.norm/baseline/` snapshot.
- `clone --new "<name>"` → `POST /v1/pathway/create` (empty shell) then pull it.

### `commit [--force]`
3-way drift (baseline vs local vs server), then **one** `POST /v1/pathway/:id` carrying the
full rebuilt graph (server validates + sanitizes + upserts inline). Re-pulls once to refresh
the baseline. O(commits), never O(files).
- Nothing changed locally → `nothing_to_commit`.
- Same file edited locally **and** on the server → `CONFLICT` (re-clone, or `--force` to
  overwrite server with local).
- Server inline-validation 400 → `VALIDATION_FAILED` with errors mapped back to files.

### `validate`
Sends the current tree to the server's inline validation and maps any errors back to the
originating file (`nodes/<slug>/node.md`, `edges/…md`). On REST the only inline-validation
surface is the update upsert, so validate uses it and re-pulls to keep the baseline coherent.
(A dedicated dry-run endpoint would replace this when available.)

### `test`
Offline (0 network) round-trip self-check: parse the tree → rebuild `nodes`/`edges` →
regenerate the tree → compare hashes. Catches lossy hand-edits of structured surfaces before
they reach the server. `.pathways/*` (derived) is intentionally excluded.

### `status [--server]`
Local hash diff vs `manifest.files` (0 network): `modified` / `added` / `deleted`.
`--server` adds one `GET` to report the server version and whether it diverged from baseline.

### `touch <file>`
Normalize trailing newline + bump mtime so `status` notices a file (helper for scripted
edits that mutate in place).

## Transport abstraction

`getAdapter(transport)` returns an adapter implementing
`getPathway`, `listPathways`, `createPathway`, `updatePathway`, `publish`.
`manifest.transport` is `'rest' | 'mcp'`.

- **REST adapter (implemented):** hits `/v1/pathway/*` with Bearer auth.
- **MCP adapter (stubbed):** fails fast with `MCP_ADAPTER_STUB`. When the `set_*` tool shims
  land it will route structured-surface writes through Bland MCP tools instead of the raw
  REST upsert. The interface is identical, so the sync engine itself is transport-agnostic.

## Endpoints used (REST adapter)

| Adapter op | HTTP | Response shape |
| --- | --- | --- |
| `getPathway(id)` | `GET /v1/pathway/:id` | `{ name, description, nodes[], edges[], production_version_number }` |
| `listPathways()` | `GET /v1/pathway` | `[{ id, name, description, production_version_number, … }]` |
| `createPathway({name})` | `POST /v1/pathway/create` | `{ data: { pathway_id }, errors }` |
| `updatePathway(id,…)` | `POST /v1/pathway/:id` | `{ status, message, pathway_data, warnings? }` (400 `{status:"error",message}` on validation failure) |
| `publish(id,…)` | `POST /v1/pathway/:id/publish` | `{ message, data }` |

Note: `GET` nests edge label/description under `edge.data`; the `POST`-update endpoint reads
them at the **top level** of each edge. The generator/parser accept both so the tree
round-trips against either shape.

## Per-file routing table

How each surface is sourced, edited, and pushed. Three classes:
**prose** (free-text, safe to hand-edit), **structured** (typed config — owned by `set_*`
MCP tools / the agent, JSON-inlined for lossless round-trip, not hand-authored), and
**derived/layout** (regenerated server-side, written for humans, skipped on commit).

| File | Surface | Class | On commit |
| --- | --- | --- | --- |
| `nodes/<slug>/node.md` body | node prompt / dialogue text | **prose** | written → graph |
| `nodes/<slug>/node.md` frontmatter `name`/`isStart`/`globalLabel` | node identity flags | prose-ish | written → graph |
| `nodes/<slug>/node.md` frontmatter `url`/`method`/`headers`/`body`/`auth`/`responsePathways`/`tool`/`code`/`routes`/`kb`/… | type-specific node config | **structured** | passthrough (JSON-inlined); set via `set_*` tools, not raw |
| `nodes/<slug>/condition.md` body | routing condition prose | **prose** | written → graph |
| `nodes/<slug>/condition.md` frontmatter `conditionExamples` | few-shot examples | **structured** | passthrough |
| `nodes/<slug>/variables.yaml` | `extractVars` (name/type/description) | **structured** | passthrough |
| `nodes/<slug>/model.yaml` | model options (temperature, …) | **structured** | passthrough |
| `nodes/<slug>/unit-tests.yaml` | node unit tests | **structured** | passthrough |
| `nodes/<slug>/tag.yaml` | node tag {name,color} | **structured** | passthrough |
| `nodes/<slug>/tools.yaml` | node-attached tool configs (TON) | **structured** | passthrough |
| `edges/<src>-to-<tgt>.md` body | edge label | **prose** | written → graph |
| `edges/<src>-to-<tgt>.md` frontmatter `description` | edge description | **prose** | written → graph |
| `edges/…md` frontmatter `_sourceId`/`_targetId` | preserved UUIDs | structural | used to rebuild the graph exactly |
| `.pathways/global_prompt.md` | global system prompt | **prose** | written → globalConfig node |
| `.pathways/layout.yaml` | node x/y positions | **derived/layout** | skipped (server re-runs Dagre) |
| `.pathways/config.yaml` | placeholder config | **derived** | skipped |

Rule of thumb: **prose** is what a human edits; **structured** surfaces should be changed
through the `set_*` MCP tools / the agent (the sync engine round-trips them verbatim but does
not author them); **derived/layout** is never pushed — the server recomputes it.

## Error envelope

```json
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "…", "details": { … } } }
```

Common codes: `NO_API_KEY`, `NO_MANIFEST`, `BAD_ARGS`, `NETWORK_ERROR`, `RATE_LIMITED`,
`HTTP_ERROR`, `SERVER_VALIDATION` → mapped to `VALIDATION_FAILED`, `CONFLICT`,
`ROUNDTRIP_DRIFT`, `MCP_ADAPTER_STUB`, `UNKNOWN_COMMAND`.
