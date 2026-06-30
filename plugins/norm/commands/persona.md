---
description: Build or manage a Bland persona — pick a voice, set call config, attach knowledge and tools, route to pathways via pathway conditions, then promote the draft to production.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__get_bland_doc"
  - "mcp__bland__query_docs_filesystem_bland"
---

# Persona

Orchestrate the user's Bland persona request through the `norm_persona` agent, which owns the persona doctrine (voice selection, draft/production versioning, pathway routing via `pathway_conditions`, and the promote flow).

There are no high-level persona MCP tools — the agent drives the Bland REST API directly, discovering each endpoint from the official docs first, then calling it through the generic passthrough (`bland_api_get` for reads, `call_bland_api` for writes). Personas live under `/v1/personas` and voices under `/v1/voices`.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_persona` agent (via the `Task` tool, `subagent_type: norm_persona`) and hand it the user request verbatim. Let it classify the work as create, edit, route, inspect, or promote.
2. Require the agent to **look the endpoint up in the docs first** (`search_bland_docs` → `get_bland_doc` / `query_docs_filesystem_bland`) before any call. Have it pick a voice via `bland_api_get` on `GET /v1/voices` (choose by description/tags, prefer `Bland Curated`) and use that voice's `id` as `call_config.voice`, then create or edit the persona with `call_bland_api` → `POST /v1/personas` (`name` required) or `PATCH /v1/personas/{id}` (edits land on the draft).
3. Route the persona into its pathway by setting `pathway_conditions` on the draft via `PATCH /v1/personas/{id}` — each condition with `name`, `prompt`, `pathway_id`, `pathway_version`, and `start_node_id`. There is no `link_pathway` / `unlink_pathway` call and no session "activate" step on this surface: the draft IS the working version; read it back via `GET /v1/personas/{id}/versions`. Remove a `pathway_conditions` entry only to stop routing into that pathway.
4. Before any high-impact action — `POST /v1/personas/{id}/versions/promote` (it archives the previous production version), `DELETE /v1/personas/{id}`, removing a `pathway_conditions` entry (it changes live routing), or any real outbound call, message, delete, or publish — get explicit user confirmation. Read-only inspection (`GET /v1/voices`, `GET /v1/personas*`, the version reads, the docs tools) never needs it.
5. Final answer must include the persona id, the affected version (draft vs production) and its version id, the chosen voice (id and name), any `pathway_conditions` added or removed, the draft state verified, whether it was promoted to production, the endpoints (`METHOD` + path) used, and any placeholder values the user must replace.

Do not invent voice ids, persona ids, version ids, pathway ids, routing conditions, or endpoints when Bland tooling is available. Never print the API key.
