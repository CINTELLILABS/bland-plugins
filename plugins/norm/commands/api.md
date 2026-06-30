---
description: "Raw Bland REST API usage, guided only by the official docs — look up the endpoint in the docs, then make the raw HTTP call through the bundled loopback caller. Hyper-focused — no high-level Bland MCP tools."
argument-hint: "<what you want to do with the Bland API>"
allowed-tools:
  - "Task"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/bland-api.cjs\":*)"
  - "Read"
  - "WebFetch"
  - "mcp__bland__search_user_docs"
  - "mcp__bland__read_doc_file"
  - "mcp__bland__list_docs"
---

# Norm — Raw Bland API

Interact with the Bland REST API at the raw HTTP level, guided ONLY by the official docs, through the `norm_api` agent. No pathway / persona / eval / call tools — just the docs and the loopback caller, so raw-API work isn't dwarfed by the 200+ tool surface.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_api` agent (via the `Task` tool, `subagent_type: norm_api`) and hand it the user request verbatim.
2. The agent finds the endpoint in the docs first — `WebFetch` on `https://docs.bland.ai` for the public API reference, or `search_user_docs` / `read_doc_file` for session-attached docs — then makes the raw call with the bundled loopback caller:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/bland-api.cjs" <METHOD> <path> [--body '<json>'] [--query '<json>']
   ```

   It reads the base URL + API key from the environment and returns `{ ok, status, method, url, response }`.
3. Before any state-changing call (`POST`/`PUT`/`PATCH`/`DELETE` — placing calls, sending messages, deleting/promoting), get explicit user confirmation. Read-only `GET`s never need it.
4. Final answer must include the endpoint (method + path), the request body/query, the HTTP status, and the parsed response. Never include the API key.

Do not use the high-level Bland MCP tools here — this command is intentionally limited to the docs and the raw loopback caller.
