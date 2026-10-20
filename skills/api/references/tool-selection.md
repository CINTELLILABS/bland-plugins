# Selecting connected Bland API tools

This contract applies to Norm, workspace commands, and domain skills. A procedure
that names `bland_api_get` or `call_bland_api` describes an API operation, not a
requirement that every host expose a generic proxy.

## Choose per operation

1. Use this plugin's authenticated Bland connection. Inspect the session's live
   tool list/schema; bare names have host-specific prefixes. Do not switch to
   another installed server or organization to find a tool.
2. Prefer `bland_api_get` for GET and `call_bland_api` for POST/PUT/PATCH/DELETE
   when that proxy is available. Check them independently: a missing write proxy
   does not prevent using the read proxy, or vice versa. Keep existing curated
   compiler, schema, context, docs and workflow tools when the procedure names them.
3. If the required proxy is absent from the live tools (including a host that
   hides generic proxies), use an available named endpoint tool instead. Read
   [the endpoint index](endpoint-tools.md) only for the needed method + route;
   inspect existing curated tools too. Match the exact operation, resource type,
   API generation and version semantics, not a similar name. The live schema is
   authoritative; the packaged index is a discovery aid, not a tool allowlist.
4. Pass the endpoint's fields directly at the top level. For example,
   `GET /v1/me` becomes `get_account_details {}` and
   `GET /v1/calls?limit=1` becomes `list_calls { limit: 1 }` when their live
   schemas match. Do not pass `{ path, query, body }` to a named tool. Generic
   GET query values are strings; named inputs use their declared types
   (numbers, booleans, arrays and objects included). Preserve filters, paging,
   target IDs, version pins and concurrency fields; if a required field cannot
   be expressed, the tool is not an equivalent fallback.
5. Generated endpoint tools return `{ data: <API JSON> }`. Unwrap the MCP tool's
   data once, then follow the endpoint's own response envelope. Do not assume
   curated tools share that wrapper. Read back changes through an equivalent
   available read tool and follow async job IDs to a terminal result.

## Absence is not an authorization error

Fallback is for a missing proxy, not a failed request. A 401/403,
`oauth_path_not_allowed`, `insufficient_scope`, disabled writes, or a host
approval refusal must stop privileged work or follow the documented reconnect
flow. Do not retry the same operation through another tool to bypass it.
For a timeout or uncertain write, read back before retrying; do not duplicate
an action by switching tools. Named tools use the same connection permissions.

The existing authorization and confirmation gates still apply to named tools:
real calls/messages, deletes, purchases, publishes/promotions and other
high-impact writes need the same approval. Validation and read-only operations
remain read-only even when a route uses POST. A tool being listed is not consent.
Never request or inspect credentials, use curl/fetch as a fallback, or fabricate
IDs, saved versions, transcripts or successful results.

## Legacy pathway capability boundary

The endpoint set added in SERVER PR #12407 does not cover the legacy workspace
routes: `GET /v1/pathway`, `GET /v1/pathway/{id}`, its versions list,
`POST /v1/convo_pathway/get_one`, `/create`, `/create-version`, `/update`,
`/publish`, or `POST /v1/pathway/chat/create` and `/v1/pathway/chat/{chat_id}`.
Do not invent `list_pathways`, `save_pathway`, or chat tools for these routes.
`list_agents` / `save_agent_version` operate on v2 agents, not v1 pathways;
agent testing tools are not the turn-by-turn pathway chat simulation.

Before clone, save, publish or simulate, check that the required operations have
an actual equivalent connected tool. If not, report the missing method + route
and which step is blocked. Continue independent reads or offline edits/structural
checks where useful, and use `validate_pathway`, `get_pathway_schema`,
`get_pathway_context` and `get_call_log` when present. Do not claim local edits
were saved, an offline check was a server compile, or a simulation ran.
