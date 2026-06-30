---
description: Build, test, and manage Bland custom integrations — REST API tools and the secrets they reference — docs-first via the raw /v1 REST API.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__get_bland_doc"
  - "mcp__bland__query_docs_filesystem_bland"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
---

# Norm Tools

Build, test, and manage Bland custom integrations and the secrets they reference; the `norm_tools` agent owns this doctrine. There are no high-level "create a tool" MCP tools — you look the endpoint up in the official Bland docs, then call the raw `/v1` REST API through the loopback passthrough.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_tools` agent via the Task tool with `subagent_type: norm_tools`, handing it the user request verbatim.
2. Discover the endpoint in the docs FIRST — `search_bland_docs` for the operation, then `get_bland_doc` (e.g. `path: api-v1/post/tools`) to confirm the exact method, path, body fields, and response shape; use `query_docs_filesystem_bland` to locate or scan pages. Never guess a path from memory.
3. Handle auth before the tool. List existing secrets with `bland_api_get` on `/v1/secrets` and reuse one by reference (`{{secret.id.SECRET_ID}}` / `{{SECRET.SECRET_NAME}}`) rather than inlining a key. There is no documented REST endpoint to create a secret — if a new one is needed, direct the user to the Secret Manager UI at `app.bland.ai/dashboard/secrets`, then re-list.
4. Build and verify through the passthrough:
   - List / inspect (read-only): `bland_api_get` on `GET /v1/tools` and `GET /v1/tools/{tool_id}`.
   - Create / update / delete (writes): `call_bland_api` with `POST /v1/tools`, `POST /v1/tools/{tool_id}`, or `DELETE /v1/tools/{tool_id}` — each confirmed from its doc page first.
   - Verify by re-reading the saved definition with `bland_api_get` on `/v1/tools/{tool_id}`; only exercise the tool's own URL through `call_bland_api` when that request is a safe, side-effect-free GET.
5. Before any high-impact `call_bland_api` write — creating a tool, overwriting a live tool, deleting a tool, or hitting a real endpoint with side effects — ask the user for explicit confirmation. `POST /v1/tools` with an empty/partial body still creates a record, so never send a write request just to probe the endpoint. Read-only `bland_api_get` and docs lookups do not need confirmation.
6. Final answer must include the `tool_id` created/updated, the secret id/name referenced (if any), the endpoint(s) called, how the saved definition was verified, and where the tool was attached or that it is ready to attach via `/norm`.

The old named tools (`create_tool`, `update_tool`, `test_tool`, `list_tools`, `get_tool`, `create_secret`, `list_secrets`, `build_rest_api_tool`, `build_custom_code_tool`) are gone — always go through the docs + `bland_api_get` / `call_bland_api` passthrough. Do not inline raw keys, do not invent endpoints or ids, and do not claim a tool works without re-reading its saved `/v1/tools/{tool_id}` definition.
