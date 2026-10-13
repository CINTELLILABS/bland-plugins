---
name: tool-library
description: Use when someone wants to "create a tool", "call my API from the agent", "wire up a webhook", says "the tool returns HTTP 0", wants to "update the shared tool" or asks "which agents use this tool", wants to "add a secret", "connect HubSpot / Salesforce" or "disconnect" an integration, or wants "custom code" in a tool, on the Tools, Secrets or Connections pages, org scoped or under an agent's Tools tab.
---

# Tools, secrets and connections

A library tool is an org row agents call mid-conversation. Read the
[tool library reference](../v2-runtime/references/tool-library.md) (routes,
definition schema, attach modes) before the first write. Attaching edits a
snapshot ([v2-snapshot](../v2-snapshot/SKILL.md)); test-chat turns follow
[v2-testing](../v2-testing/SKILL.md).

## Page context

Call `get_dashboard_page_context` (`mode: "synced"`) first. No target chip
exists here.

- `/dashboard/tools`, `/dashboard/tools/create`: org scope.
- `/dashboard/tools/$toolId`: tool id.
- `/dashboard/tools/secrets`, `/dashboard/tools/connections`: lists.
- `/dashboard/tools/resources/$resourceId`: resource id.
- `/dashboard/agent/$agentId/tools/**`: agent id, plus tool id on `$toolId`.

Mutate through the API, never the page's forms. After every write say:
"Saved through the API. The page shows it after a refresh."

## Workflow: create and prove a tool

Budget: search, create, run, one test-chat turn, attach save.

1. `bland_api_get` `/v1/tools?search=<name>`; reuse a match.
2. Write the definition per the reference. Never put `url` or `method` at the
   top level of an integration definition; `input_schema` must be an object
   schema. Both save cleanly, then fail every call with HTTP 0.
3. `call_bland_api` POST `/v2/tools`. Keep the id.
4. POST `/v2/tools/<id>/run` with `{"inputs": {…}}`, synthetic values.
5. One test-chat turn that makes the agent call it.
6. Attach and say why this mode: embedded copy (frozen, this agent),
   `byReference` or a `tool` step by `toolId` (both follow library edits).

"My tool says HTTP 0": check the definition against the reference. Do not
retry the run.

## Workflow: change a shared tool safely

Budget: read, agent scan, write, read-back, run.

1. `bland_api_get` `/v1/tools/<id>`. Keep the original.
2. Find consumers; no reverse index exists. Page `/v2/agents`. Per agent
   read `/versions/latest`, then `/environments` and each pinned staging or
   production `current_version.semver` via `/versions/<semver>` (production
   may be older). Match the id (with or without `TL-`) on a
   `byReference` tool or `tool` step. Embedded copies do not change.
3. Show the diff and the affected agents. Confirm.
4. POST `/v2/tools/<id>` with only the changed keys (validated merge). Never
   send a partial body to POST `/v1/tools/<id>`: it replaces the row unvalidated.
5. Read back, then `/run`.

## Workflow: secrets

1. `bland_api_get` `/v1/secrets`; reuse a match.
2. Prefer the user creating or rotating the value on Tools, Secrets, so it
   never enters the chat. On request, POST `/v1/secrets` `{name, secret}`.
3. Reference it by id: `{{secret.id.<secret id>}}`. Delete is UI-only.

## Workflow: connections

1. POST `/v1/integrations/<key>/connect` with `{"name": "<label>"}`.
2. Give the user the `connect_link`. Poll `/v1/resources?integration=<key>`
   until a new active row appears.
3. Reconnect is UI-only.
4. Before POST `/v1/resources/<id>/disconnect` or DELETE `/v1/resources/<id>`,
   page `/v1/tools` and list the rows whose `resource_id` matches: they
   deactivate. Confirm.

## Custom code

Snippet create and update take raw text the API tools cannot send: save code
in the builder. Then read `/v1/snippets/get/<id>` and re-pin `snippetId` and
`snippetVersion`.

## Confirm before

Any shared-tool write or delete (name the agents), any disconnect:

```text
About to <verb> <object>: <what changes, which agents or tools are affected>.
This <changes live calls now | deactivates N tools | cannot be undone>.
Reply "yes" to proceed.
```

## Refusals and limits

- `oauth_path_not_allowed`: say "this connection cannot reach tools; do it
  on /dashboard/tools" and stop.
- `INVALID_TOOL_TYPE` from POST `/v2/tools/<id>`: a legacy tool. After the
  confirm, POST the full original with the change to `/v1/tools/<id>`, with
  `staging_tool`; omitting it wipes the staging version.

## Do not

- Show tool headers; redact them on every read.
- Call `/nango/connection/*` or `/v2/tools/suggestions`.
- Treat `/run`, `/v1/tools/run` or `/v1/resources/<id>/execute` as reads.
- Write fetch scripts, search docs for these routes, or guess fields.
