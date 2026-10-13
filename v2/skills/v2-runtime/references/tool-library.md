# Tool library, secrets and connections

The org's tool library, the secrets its tools reference, and the connections
(resources) that hold third-party credentials. This page is the contract. The
[tool-library skill](../../tool-library/SKILL.md) holds the workflows that use
it. How an attached tool behaves inside a turn is in
[tools and handoffs](tools-and-handoffs.md).

Use `bland_api_get` for reads (query values are strings) and `call_bland_api`
with `{method, path, body}` for writes. Do not write fetch scripts and do not
search the docs for these routes.

## Contents

- [Access: API key only](#access-api-key-only)
- [Response envelopes](#response-envelopes)
- [Tool routes](#tool-routes)
- [Secret routes](#secret-routes)
- [Connection routes](#connection-routes)
- [Snippet routes](#snippet-routes)
- [The definition](#the-definition)
- [Definition kinds](#definition-kinds)
- [The HTTP-0 trap](#the-http-0-trap)
- [Attach modes and blast radius](#attach-modes-and-blast-radius)
- [Tool logs as evidence](#tool-logs-as-evidence)

## Access: API key only

Every route on this page needs an install that authenticates with an org API
key. A keyless install connects over OAuth, and that connection refuses
`/v1/tools/**` and `/v2/tools/**` (reads included, because stored headers can
hold credentials) and every secret, resource, integration and snippet route.
The refusal code is `oauth_path_not_allowed`. Say "this connection cannot
reach tools, secrets or connections; do it on /dashboard/tools" and stop.
Never retry through another route.

## Response envelopes

- `/v2/tools/**`, `/v1/secrets/**`, `/v1/resources/**` and
  `/v1/integrations/**` answer `{data, errors}`.
- The v1 tool routes put the payload at the root: `GET /v1/tools` returns
  `{status, tools, nextCursor, hasMore}`; `GET /v1/tools/:id` returns
  `{status, tool}`. Each row carries `tool_id` (prefixed `TL-`), `tool` (the
  production definition), `staging_tool`, `resource_id`, `label`, `public`,
  `is_active` and `agent_id`.
- Ids: the v1 tool routes and `POST /v2/tools/:id/run` accept the id with or
  without `TL-`. `POST /v2/tools/:id` and `DELETE /v2/tools/:id` need the raw
  UUID; `TL-` answers 400 `id: Invalid UUID format`.

## Tool routes

Gate: **none** = read. **confirm** = state the change and wait for yes.
**REQUIRED** = the confirm template with the consequence, and a consumer scan
first.

| Method and path | Body or query | What to know | Gate |
|---|---|---|---|
| `GET /v1/tools` | `search`, `cursor` (the previous page's `nextCursor`), `limit`, `agent_id`, `include_referenced` | `include_referenced=true` with `agent_id` adds tools the agent's current version uses; rows then carry `owner: agent` or `shared`. Headers come back in clear. | none; redact headers |
| `GET /v1/tools/:id` | | One row. | none; redact headers |
| `GET /v2/tools` | `page`, `limit` (1 to 1000), `search`, `agent_id` | Offset paging. There is no `GET /v2/tools/:id`. | none |
| `POST /v2/tools` | definition plus `resource_id`, `public`, `staging_tool`, `label`, `agent_id` | Unknown keys are refused. `name`, `description`, `integration` and `action` are required; the pair must exist. Returns `data.id`. | confirm |
| `POST /v2/tools/:id` | changed keys only | Shallow merge onto the row, then validated. Integration tools only: a legacy HTTP tool answers 400 `INVALID_TOOL_TYPE`. Live for every consumer at once. | REQUIRED |
| `POST /v1/tools/:id` | the whole row | Full replace, no validation. A missing key is dropped; an omitted `staging_tool` clears the staging version; an unknown key is stored and can demote the tool to HTTP 0. Use only for legacy HTTP tools, with the full original. | REQUIRED |
| `DELETE /v2/tools/:id`, `DELETE /v1/tools/:id` | | Hard delete with no reference check. Breaks every `byReference` and `tool`-step consumer. | REQUIRED |
| `PATCH /v1/tools/:id/owner` | `{agent_id}` or `{agent_id: null}` | Moves the row between an agent's Tools tab and the org list. | confirm |
| `POST /v2/tools/:id/run` | `{inputs}`; `?staging=true` runs `staging_tool` | Merges `inputs` over the saved `body` and executes for real. Returns `data.{success, statusCode, data, responseTime}` and `console` for code tools. Draft tools answer 400. | confirm when the tool writes, texts, transfers or books |
| `POST /v1/tools/run` | `{url, method, headers?, body?}` | Probes an unsaved HTTP request from the platform. | confirm for any method but GET |
| `GET /v2/tools/logs` | see [tool logs](#tool-logs-as-evidence) | | none |
| `GET /v2/tools/logs/stats` | see [tool logs](#tool-logs-as-evidence) | | none |
| `POST /v2/tools/suggestions` | | Runs paid inference. Do not call it; list and search instead. | do not use |
| `POST /v1/tools`, `POST /v1/tools/clone` | | The first stores anything unvalidated; the second creates nothing. Duplicate by reading a row and creating it again through `POST /v2/tools`. | do not use |

## Secret routes

| Method and path | Body | What to know | Gate |
|---|---|---|---|
| `GET /v1/secrets` | | Values are never returned. | none |
| `GET /v1/secrets/:id` | | Metadata only. | none |
| `POST /v1/secrets` | `{name, secret}` for a static value, or `{name, config: {url, method, headers, query?, body?, response, refresh_interval}}` for a refreshing one (`method` GET or POST, `response` a JSON path, `refresh_interval` in minutes) | Needs the admin, owner or operator role. `name` is letters, digits and underscores. The value passes through the chat; prefer the user typing it on /dashboard/tools/secrets. | confirm |
| `PATCH /v1/secrets/:id` | `{name?, secret?, config?}` | A new `secret` rotates the value everywhere it is referenced, at once. A rename breaks every `{{SECRET.<name>}}` reference; id references survive. | REQUIRED |
| `POST /v1/secrets/test-refresh` | a refresh `config` | Makes the outbound request. Rate limited (429). | confirm |
| `DELETE /v1/secrets/:id` | | Signed-in dashboard sessions only; an API key gets 404. Hand it to /dashboard/tools/secrets. | not available |

Reference a secret by id: `{{secret.id.<secret id>}}`. The name form
`{{SECRET.<name>}}` also resolves but breaks on rename. Agent environment
variables marked secret are a different store (the `v2-lifecycle` skill).

## Connection routes

A connection (resource) holds a third party's credentials for the org. Slack,
HubSpot, Salesforce, Notion, Google Calendar, Google Docs, Calendly and Cal.com
connect only through a browser OAuth hand-off. `rest_api`, `custom-code`,
`bland` and `bland-sms` need no connection.

| Method and path | Body or query | What to know | Gate |
|---|---|---|---|
| `GET /v1/integrations`, `/:key`, `/:key/actions`, `/:key/tools`, `/:key/resources`, `/:key/eligibility` | | `/:key/actions` gives each action's input schema. | none |
| `GET /v1/resources`, `/:id`, `/:id/actions` | `page`, `limit` (up to 100), `integration`, `is_active` | | none |
| `POST /v1/integrations/:key/connect` | `{name, description?, callback_url?, metadata?}`; `name` is required | Returns `data.{connect_link, token, expires_at}`. A person opens the link; the resource row appears when they finish. Poll `GET /v1/resources?integration=<key>`. | confirm |
| `POST /v1/integrations/:key/context/execute`, `POST /v1/resources/:id/context/execute` | `{action, arguments?}` | Fills pickers (for example Slack channels) with the stored token. Reads the third party. | none |
| `POST /v1/resources` | `{integration, auth, name, description?, config?, tags?, metadata?}` | `auth` is `{type, data}`: `none`, or `api_key`, `bearer`, `basic` or `oauth2` with `data.secretId` of an existing secret. Browser-OAuth integrations come only from the connect link. | confirm |
| `POST /v1/resources/:id` | `{name?, description?, config?, tags?, metadata?}` | Cannot change auth. | confirm |
| `POST /v1/resources/:id/reauth` | | Needs the browser. Hand it to /dashboard/tools/connections. | not available |
| `POST /v1/resources/:id/execute` | `{action, inputs}` | Runs the action for real: posts the message, writes the CRM record. | confirm |
| `POST /v1/resources/:id/disconnect` | | Revokes the credentials and sets `is_active: false` on every tool whose `resource_id` matches. List them first. | REQUIRED |
| `DELETE /v1/resources/:id` | | The same tool deactivation, then a hard delete. | REQUIRED |

Never call `/nango/**`: those routes are dashboard plumbing and one returns
provider tokens.

## Snippet routes

| Method and path | What to know |
|---|---|
| `GET /v1/snippets/list`, `GET /v1/snippets/get/:id` | Reads. Use them to find the id and the current version. |
| `POST /v1/snippets/create?language=js&name=<name>`, `POST /v1/snippets/update?snippet_id=<id>` | The body is the raw script as `text/plain`. The API tools send JSON only, so these are not reachable here. Code is saved in the builder. An update creates a new version. |
| `POST /v1/snippets/run/:id` | `{payload, headers, version?, timeout_ms?}`. Executes the snippet for real. |
| `POST /v1/snippets/delete` | `{snippet_id}`. Breaks every pin. REQUIRED confirm. |

## The definition

The definition is the tool JSON: the library row's `tool` column, and the
`definition` an agent embeds. Keys the runtime accepts:

| Key | Type and unit | Note |
|---|---|---|
| `name` | string, required | |
| `description` | string, required (up to 5000 on save) | What the model reads to decide to call it. |
| `integration`, `action` | strings, required | A registered pair, listed by `GET /v1/integrations/:key/actions`. |
| `body` | object or JSON string | Action inputs. Placeholders resolve here. |
| `input_schema` | `{type: "object", properties: {...}, required?: [...]}` | What the model fills. Each property becomes `{{input.<name>}}`. |
| `response_data` | `[{name, data, context?, sensitive?}]` | `data` is a JSONPath into the result; `name` becomes a call variable. |
| `speech` | string | Filler line while the tool runs. |
| `timeout` | number, **milliseconds**, 1000 to 60000 | |
| `cooldown` | number, **seconds**, 1 to 30 | |
| `max_retries` | number, 0 to 4 | Transport retries inside one invocation. Not the step's `retryLimit` (0 to 5), which is how often the model may call the tool again after a failure. |
| `cache` | boolean | |
| `resource_id` | string | The connection, for connection-backed integrations only. |
| `extractVarSettings` | `{audioVariables?, ignorePrevious?, useAudio?, sensitiveVariables?}` | `sensitiveVariables` maps input names to `true` to keep values out of logs. |

Placeholders inside `body`:

- `{{input.<name>}}`: a value the model supplied for an `input_schema`
  property. A bare `{{<name>}}` is a call variable instead.
- `{{secret.id.<secret id>}}`: a secret, resolved at run time and scrubbed
  from results.

Example, synthetic, a REST POST:

```json
{
  "name": "create_ticket",
  "description": "Open a support ticket for the caller's issue.",
  "integration": "rest_api",
  "action": "post",
  "body": {
    "method": "POST",
    "url": "https://api.example.com/tickets",
    "headers": [{ "key": "Authorization", "value": "Bearer {{secret.id.<secret id>}}" }],
    "body": "{\"summary\": \"{{input.summary}}\", \"phone\": \"{{from}}\"}"
  },
  "input_schema": {
    "type": "object",
    "properties": { "summary": { "type": "string", "description": "One-line issue summary" } },
    "required": ["summary"]
  },
  "response_data": [{ "name": "ticket_id", "data": "$.data.rest_api_post_data.id" }],
  "timeout": 10000
}
```

## Definition kinds

| Kind | `integration` / `action` | `body` | Note |
|---|---|---|---|
| REST call | `rest_api` / `get` or `post` | `{method, url, headers: [{key, value}], body?}` | Only `get` and `post` exist. GET and DELETE use `get`, which drops any request body. POST, PUT and PATCH use `post`; `body.method` carries the real verb. Results sit under `$.data.rest_api_get_data` or `$.data.rest_api_post_data`, with `..._status` beside them. |
| Custom code | `custom-code` / `run_snippet` | `{snippet_id, snippet_version?, variables?, connections?, secrets?, timeout?}` | `body.timeout` is in **seconds** (1 to 60, default 10); a top-level `timeout` in ms is converted when `body.timeout` is absent. `connections` maps an alias to `{resource_id}`; `secrets` maps an alias to a secret reference. The snippet reads them under `input.connections` and `input.secrets`. |
| Call control | `bland` / `cold_transfer_call`, `warm_transfer_call`, `transfer_pathway`, `transfer_conversation`, `end_call`, `press_button`, `query_kb` | per action | Acts on the live call. Transfers dial real lines only on voice calls. |
| Text message | `bland-sms` / `send_sms` | `{to, from?, message}` | E.164 numbers, `message` up to 1600 characters. Texts a real person. |
| Connection-backed | `slack`, `hubspot`, `salesforce`, `notion`, `google-calendar`, `googleDocs`, `calendly`, `cal-com` / per action | per action | Needs `resource_id` of an active connection in the org. |

`bland` and `bland-sms` ignore `resource_id`.

## The HTTP-0 trap

A save checks less than the runtime. At run time a definition that fails the
runtime check is not refused: it falls through to the legacy HTTP path, which
has no URL, and every call fails with "HTTP 0" or "Invalid URL format".

It fails the check when:

- any top-level key is outside the table in [the definition](#the-definition)
  (for example a top-level `url`, `method` or `headers` on an integration
  tool; those belong inside `body`);
- `input_schema` is a string, or an object without `type: "object"` and
  `properties`. The save accepts a string schema;
- `name`, `description`, `integration` or `action` is missing or empty;
- `timeout`, `cooldown` or `max_retries` is out of range.

Snapshot saves do not validate an embedded `definition` at all. Prove every
new or edited definition twice: `POST /v2/tools/:id/run` with synthetic
inputs (it applies the same check and fails the same way), then one test-chat turn that makes the
agent call it (the attached path adds node settings). An embedded definition
has no library row to run; save it as a library tool first or prove it with
the test-chat turn alone.

## Attach modes and blast radius

| Mode | Snapshot shape | What runs | Who a library edit reaches |
|---|---|---|---|
| Embedded copy | step tool with `definition` and provenance `toolId` | The embedded definition as saved in the version. | Nobody. The copy is frozen until someone re-copies it and saves a version. |
| By reference | step tool with `byReference: true`, `toolId`, optional `toolOverrides` (dot-path body overrides) | The library row's current definition, fetched by id on each call, with overrides applied. | Every call of every agent that holds it, at once, with no version save or promotion. |
| Tool step | `tool` step with `toolId`, `overrides` rows | The library row's current definition, unless an imported step carries `embeddedTool`. | Same as by reference. |

`isStaging` on a step tool runs the staging definition: `stagingDefinition`
for an embedded copy, the row's `staging_tool` for a reference.

No route lists a tool's consumers. Find them by reading each agent's dev head
and every version an environment pins, and matching the id (with or without
`TL-`) on a `byReference` tool or a `tool` step.

## Tool logs as evidence

`GET /v2/tools/logs` lists integration runs. Filters: `call_id`, `tool_id`,
`resource_id`, `integration`, `action`, `status` (`success` or `error`),
`error_type`, `execution_time_ms_gt` and `_lt`, `input_size_kb_gt` and `_lt`,
`output_size_kb_gt` and `_lt`, `created_after`, `created_before`, `page`,
`pageSize` (up to 100).

`GET /v2/tools/logs/stats` aggregates them: `group_by` is a comma list of
`integration`, `action`, `status`, `tool_id`, `resource_id`, `error_type`,
`date`; `metrics` is `count` or `<field>:avg` for `execution_time_ms`,
`input_size_kb`, `output_size_kb`; `period` is `today`, `week` or `month`, or
pass `start_date` and `end_date`; the same filters apply; `limit` up to 1000.

- For one call: `GET /v2/tools/logs?call_id=<call id>`.
- For a failing tool: `GET /v2/tools/logs/stats?group_by=tool_id,error_type&status=error&period=week`.
- Only the integration path writes these rows. A tool that the trace shows
  firing but that has no row for the call was demoted to the HTTP path: read
  [the HTTP-0 trap](#the-http-0-trap). An error row with an upstream status is
  the third party answering, not a bad definition.
