---
description: Track and manage issues found in Bland agents. Use when the user wants to file, log, or report a bug or issue, attach evidence (calls, pathways, nodes, SMS), update or move issue status, link related issues, or flag a platform capability gap or missing feature.
argument-hint: "<issue task>"
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__bland_api_get"
  - "mcp__plugin_norm_bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__plugin_norm_bland__call_bland_api"
  - "mcp__bland__search_bland_docs"
  - "mcp__plugin_norm_bland__search_bland_docs"
  - "mcp__bland__get_bland_doc"
  - "mcp__plugin_norm_bland__get_bland_doc"
  - "mcp__bland__query_docs_filesystem_bland"
  - "mcp__plugin_norm_bland__query_docs_filesystem_bland"
---

# Norm Triage

Route the user's triage request through the `norm_triage` agent, which owns the doctrine for filing issues, attaching evidence, moving status, linking related work, and honestly surfacing genuine platform capability gaps.

There are no high-level triage MCP tools — the agent drives the Bland REST API directly, discovering each endpoint from the official docs first (`search_bland_docs` → `get_bland_doc`, and `query_docs_filesystem_bland` for the docs filesystem), then calling it through the generic passthrough (`bland_api_get` for reads, `call_bland_api` for writes). The triage surface lives under `/v1/triage`.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_triage` agent (via the `Task` tool, `subagent_type: norm_triage`) and hand it the user request verbatim. Let it classify the work as filing, evidencing, discussing, linking, or status-moving, and drive the triage REST endpoints through the passthrough.
2. Before filing a new issue, have the agent check for duplicates with `bland_api_get /v1/triage/issues` (using `search` and the `status`/`severity` filters) and `bland_api_get /v1/triage/issues/{id}` on near-matches, then file with `call_bland_api POST /v1/triage/issues` (body requires `title`, `severity`, `category`) and attach the offending call, pathway, node, or SMS via `POST /v1/triage/issues/{id}/resources` (or the `PUT .../calls/{callId}` shorthand) plus severity/labels via `POST /v1/triage/issues/{id}/flags`.
3. Endpoints are discovered from the official docs, never guessed. Have the agent confirm the exact path, parameters, and body fields from the docs before any call.
4. Before any high-impact write — detaching a resource, removing a flag or relation, a `PATCH` that closes or reclassifies an issue, or deleting an issue — get explicit user confirmation. Read-only inspection (any `bland_api_get` against `/v1/triage/*` — listing/getting issues, resources, flags, relations, activity, categories, flag-types) never needs it.
5. Capability-gap reporting has no `/v1/triage` endpoint on this surface; reserve it for genuine platform limitations (not fixable agent misconfigurations). Have the agent capture a real limitation as a labelled comment or issue and tell the user that formal capability-gap filing is out of scope here.
6. Final answer must include the triage issue id(s) created or updated, their current status, the evidence resources and flags attached, any relations linked, and — if a platform limitation surfaced — exactly what is missing and that formal capability-gap reporting was out of scope.
