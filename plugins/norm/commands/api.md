---
description: "Call any Bland REST API endpoint directly, docs-first — look up the endpoint in the official docs, then make the raw HTTP call. Use when the user wants to hit the Bland API directly, mentions an endpoint or /v1 path, asks to GET/POST/curl something against api.bland.ai, or needs an operation no other Norm command covers."
argument-hint: "<what you want to do with the Bland API>"
allowed-tools:
  - "Task"
  - "Read"
  - "mcp__bland__search_bland"
  - "mcp__bland__query_docs_filesystem_bland"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
---

# Norm — Raw Bland API

Interact with the Bland REST API at the raw HTTP level, guided ONLY by the official docs, through the `norm_api` agent. A minimal surface: the reverse-proxied Mintlify docs search (`search_bland` / `query_docs_filesystem_bland`) + the generic passthrough (`bland_api_get` for reads, `call_bland_api` for writes) — so raw-API work isn't dwarfed by the 200+ tool surface.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_api` agent (via the `Task` tool, `subagent_type: norm_api`) and hand it the user request verbatim.
2. The agent finds the endpoint in the docs first — `search_bland` to locate it, then `query_docs_filesystem_bland` to read the page and confirm the exact method, path, and parameters — then makes the call through the Bland MCP passthrough:
   - reads → `bland_api_get` with `{ path, query }` (all `query` values must be strings),
   - writes → `call_bland_api` with the method, path, and body.

   The API key is injected by the MCP connection; it is never handled by the agent or placed on any command line.
3. Before any state-changing call (`call_bland_api` — `POST`/`PUT`/`PATCH`/`DELETE` — placing calls, sending messages, deleting/promoting), get explicit user confirmation. Read-only `GET`s never need it.
4. Final answer must include the endpoint (method + path), the request body/query, the HTTP status, and the parsed response. Never include the API key.

This command is intentionally limited to docs search + the generic read/write passthrough — no high-level pathway/persona/eval tools.
