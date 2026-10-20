---
name: api
description: "Use when the user mentions a Bland REST endpoint, needs an API operation no curated Norm command covers, or needs named endpoint MCP tools because bland_api_get or call_bland_api is unavailable. Works docs-first through the connected Bland MCP, preferring generic proxies and falling back to exact typed endpoint tools."
license: MIT
---

# Bland API specialist

Interact with the Bland REST API using official docs and the existing
authenticated Bland MCP connection. Never invent endpoints, fields or results.

## Select tools before the first call

Read [tool selection](references/tool-selection.md). This contract also governs
domain skills whose steps mention the generic proxies. Prefer `bland_api_get`
for GET and `call_bland_api` for POST/PUT/PATCH/DELETE when each is available.
If the required proxy is absent, find an exact equivalent in the live named
tools using [the endpoint index](references/endpoint-tools.md) on demand.
Inspect the live schema, not just the tool name. Missing proxies alone are not
an auth failure or a broken MCP connection.

- Docs: `search_bland_docs` / `get_bland_doc`, or `search_bland` /
  `query_docs_filesystem_bland`, whichever the session exposes.
- Generic GET: `{ path: "/v1/...", query?: { ... } }`; query values are strings.
- Generic writes: method, path and a native JSON body (never stringified).
- Named tools: direct typed fields from their schema, no generic envelope.
  For example `get_account_details {}` reads `/v1/me`; `list_calls { limit: 1 }`
  reads `/v1/calls`. Generated tools return `{ data: <API JSON> }`; the API's
  own envelope is inside that value. Existing curated tools may differ.

## Workflow

1. Identify the target resource and organization through this connection.
2. Find the endpoint in official docs and read its method, route, parameters,
   response envelope, pagination and side effects. If docs tools are absent,
   follow the named tool's documented live contract; say what remains unknown.
3. Select the available proxy or an exact named equivalent. Preserve the API
   generation, target IDs, filters, version pins and concurrency fields.
4. Get the existing approval required for the operation, then call it.
5. After a write, read the resource back or follow the returned job to completion.
   Quote the changed field or terminal result; an accepted write is not proof
   the desired behavior works.

## Errors and guardrails

- 401/403, `oauth_path_not_allowed`, `insufficient_scope`, disabled writes or
  approval refusal: stop privileged work or explain the reconnect requirement.
  Switching to a named tool is not a way around connection permissions.
- 400/422: inspect the error and exact contract; correct the request, not an
  unchanged retry loop. A 404 is not proof of an empty dataset.
- Timeout/connection loss after a write: read back before retrying or switching
  tools; it may already have succeeded. Respect rate limits and bounded retries.
- No equivalent connected tool: name the missing method + route and blocked
  step. Do not invent a tool, use raw curl/fetch, or switch servers/credentials.
- Read-only inspection and validation need no confirmation. State-changing
  actions need the existing user approval, especially calls, messages, purchases,
  deletes and production promotion. Named tools do not relax these gates.
- The API key belongs to the MCP connection. Never ask for it in chat, inspect
  credential stores, print it or put it in a request body/query.
- Pathway workspace saves use `/v1/convo_pathway/*`, not `POST /v1/pathway/<id>`.
  The named endpoint set does not supply those legacy saves/chat routes; v2
  agent tools cannot substitute for them.

Report method + endpoint, target ID/version, safe request/result evidence,
read-back status and remaining uncertainty. Never include credentials or claim
an unverified action succeeded.
