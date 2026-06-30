---
description: Build and query Bland knowledge bases the agent can retrieve from and cite mid-call — ingest, verify retrieval, and attach to a persona or pathway.
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

# Norm Knowledge

Orchestrate the user's knowledge-base request through the `norm_knowledge` agent, which owns the doctrine (ingest, verify retrieval, attach so the agent can cite mid-call, and docs vs KB).

There are no high-level knowledge-base MCP tools — the agent drives the Bland REST API directly, discovering each endpoint from the official docs first, then calling it through the generic passthrough (`bland_api_get` for reads, `call_bland_api` for writes). The knowledge-base surface lives under `/v1/knowledge`.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_knowledge` agent (via the `Task` tool, `subagent_type: norm_knowledge`) and hand it the user request verbatim. Let it classify the work as build a KB, extend a KB, verify retrieval, attach a KB, or search the Bland docs.
2. Require the agent to **look the endpoint up in the docs first** (`search_bland_docs` → `get_bland_doc` / `query_docs_filesystem_bland`) before any call, then inspect existing knowledge — `bland_api_get` on `GET /v1/knowledge` and `GET /v1/knowledge/{id}` — before ingesting with `call_bland_api` → `POST /v1/knowledge/learn` (`type:"text"` or `type:"web"`), so it extends the right KB instead of duplicating one.
3. Require the agent to verify retrieval with `call_bland_api` → `POST /v1/knowledge/chat` (or `/answer`) — asking a real caller question and confirming the correct passage returns in `sources` — before calling the KB ready, then attach it via `kb_ids` to the persona or pathway.
4. Before any high-impact action — `DELETE /v1/knowledge/{id}`, or anything that mutates production, sends messages, makes real outbound calls, or costs money — get explicit user confirmation. Read-only inspection (`GET /v1/knowledge*`, the docs tools) and retrieval verification (`POST /v1/knowledge/chat`) never need it.
5. Final answer must include the KB id, what was ingested (source type/scope), the verification questions and whether the right passage returned, where the KB was attached (`kb_ids` target), any deletions performed only after confirmation, and the endpoints (`METHOD` + path) used.

Do not invent KB ids, retrieved passages, endpoints, or verification results when Bland tooling is available. Never print the API key.
