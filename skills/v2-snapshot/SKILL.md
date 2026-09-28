---
name: v2-snapshot
description: The Bland v2 agent snapshot dialect — the exact JSON shape of an agent version (behavior graph, hub, complex scenarios, flow steps, edges, tools, settings) and the rules for authoring one by hand. Use whenever reading, writing, or debugging an agent_versions snapshot, pushing a version via POST /v2/agents/:id/versions, or carrying content into a snapshot during migration.
---

# The v2 Agent Snapshot Dialect

> **Server binding (v1/v2 isolation):** all API work in this skill goes through THIS plugin's MCP server only (`plugin_norm_bland` — `mcp__plugin_norm_bland__*` on Claude Code). Never call the v1 plugin's server or a project-scoped `bland` server, even though they expose similar tools — they may be authenticated to a DIFFERENT organization. Identity is proven by the org smoke check, never by tool namespace.


A v2 agent version is one JSON document (the "snapshot"). The platform compiles
it into an executable conversation graph; the builder is a view of that design,
not the complete runtime graph. Some retained fields are inactive. Read the
[builder/runtime mapping](../v2-runtime/references/builder-runtime-map.md) before
interpreting a visual disconnection or editing a field without a visible control.
The [node catalog](references/node-catalog.md) covers simple/nested scenarios,
auth zones, channel routing, scheduling, telephony, and verification nodes beyond
the common shapes below. Consult it before assuming a node family is unsupported.

## Top level

```json
{
  "behavior": { "nodes": [...], "edges": [...] },
  "settings": { "systemPrompt": "...", "displayName": "...", "languages": ["english"],
                "voice": {...}, "voiceCall": {...}, "webChat": {...},
                "interruptionSensitivity": ..., "backgroundNoise": ..., "enableMemory": ...,
                "reactions": [...], "tapbackReactions": [...] },
  "contact": {...}
}
```

- `settings.systemPrompt` is the agent's global brain — persona, conduct rules, tone. It applies on every step.
- Push with `POST /v2/agents/:agentId/versions`, body `{"snapshot": {...}, "name": "optional version name"}` plus the documented concurrency fence when editing an existing head. The server rejects malformed snapshots; distinguish validation errors from authentication, conflicts and rate limits using the [API recovery rules](../api-workspace/references/api.md). An unnamed push may coalesce into an unnamed head version; name versions you want to keep addressable.

## behavior.nodes — the agent graph

| type | role | data keys |
|---|---|---|
| `inbound` | call entry marker | `number` |
| `agent` | THE HUB — greets, triages, routes between scenarios | `prompt` (hub routing prompt), `variables` (extraction rows), `loopWhile` |
| `complex-scenario` | one self-contained flow (a department, a task) | `name`, `entry`, `rule`, `target: {"kind":"dialogue","label":"Nested flow"}`, `flow: {nodes, edges}` |
| `end-call` | a root hang-up node | `name`, `entry`, `prompt`, `settings`, `variables`, `useStaticText`, `loopWhile`, `ignorePreviousExtractions`, `useAudioExtraction` |

`behavior.edges` normally contains one edge: `{"id":"e-inbound-agent","type":"straight","source":"inbound","target":"agent","animated":true,"deletable":false,"selectable":false}`. **The call enters whatever the inbound edge targets.** To make a specific scenario the call entry (e.g. a silent bootstrap that must run code before anyone speaks), re-point `source:"inbound"`'s `target` at that scenario's node id — do NOT try to make the hub "stay silent first" via prompt; the hub is generative and waits for the caller.

### entry — how the hub decides to enter a scenario

```json
"entry": { "mode": "llm", "label": "Sales", "description": "<the routing criteria, verbatim>", "alwaysPick": false }
```

The `description` is the entry routing contract for eligible generated hub and
sibling routes. Explicit incoming routing edges affect auto-entry eligibility;
do not assume all entries are available from every step. Carry criteria verbatim
in migrations. `rule` is a short human summary of what the scenario owns.

## flow.nodes — the steps inside a complex scenario

Use `[{type:"start"}, ...steps..., {type:"end"}]` as an authoring convention.
The required Start pill must have an outgoing edge to the intended entry step;
array order and visual position do not establish that entry. End is a component
exit, not a phone hang-up or a guarantee of a hub hop. Every node, edge, rule,
condition, and variable row carries a unique `id` (UUID). Positions are layout.

| type | data shape (key fields) |
|---|---|
| `prompt` | `name`, `prompt` (the step's full instruction text), `variables` (extraction rows), `settings`, `useStaticText`, `loopWhile`, `ignorePreviousExtractions`, `useAudioExtraction` — plus optional `tools` (attached tools, below) |
| `customCode` | `name`, `code` (editor copy; the runtime executes ONLY the pin), `snippetId`, `snippetVersion`, `variables` (INPUT rows — see below), `settings` |
| `route` | `name`, `rules: [{id, targetNodeId, conditions: [{id, field, operator, value}]}]`, `fallbackNodeId`, `settings` |
| `transfer` | `name`, `prompt`, `transferNumber`, `transferType`, `transferExtension`, `warmTransfer`, `variables`, `settings` |
| `webhook` | `name`, `url`, `method`, `headers`, `body`, `timeoutSeconds`, `maxRetries`, `responsePathways`, `settings` |
| `tool` | `name`, `toolId` (a saved org tool, `TL-…`), `overrides`, `responsePathways`, `isStaging`, `settings` |
| `sms`, `knowledge` | message/fromNumber; kbIds (node-scoped knowledge) |

### Variables rows (extraction and code inputs)

```json
"variables": [{ "id": "<uuid>", "key": "sales_reason", "value": "The caller's reason for contacting sales", "type": "string", "accurateSpelling": false }]
```

On `prompt` steps, rows are extraction: `value` describes what to extract;
`type` and `accurateSpelling` belong to this row contract. On `customCode` steps,
rows are the snippet's INPUT map (`id`, `key`, `value`), not extraction rows.
Only these mapped values reach the snippet. Map its full read-set explicitly,
e.g. `{"id":"<uuid>","key":"said_name","value":"{{said_name}}"}`.
An unresolved `{{placeholder}}` remains literal; see the runtime skill.

### Route steps

`conditions` within one rule are ANDed; separate rules are alternatives checked in order; `fallbackNodeId` catches everything else. Operators seen in production: `equals`, `is`, `contains`, plus comparisons. **A route with no matching rule and no fallback is a hard runtime crash for that caller** — never leave `fallbackNodeId` empty unless the source of truth genuinely had none.

### Flow edges

```json
{ "id": "<uuid>", "type": "pathway", "source": "<stepId>", "target": "<stepId>",
  "data": { "mode": "llm", "label": "...", "description": "...", "alwaysPick": false, "conditions": [] } }
```

- `mode: "llm"` — the model chooses using label + description.
- `mode: "deterministic"` — `conditions` rows (`field/operator/value` on call variables) decide mechanically.
- `alwaysPick: true` — forced traversal (use after a `customCode` step to its router).
- Exits: preserve one edge per DISTINCT exit intent from a step to the end pill,
  each with its own label. Verify the outer continuation instead of assuming an
  exit necessarily visits the hub.

### Step settings

```json
"settings": { "tag": null, "media": [],
  "global": { "isGlobal": false, "label": "", "description": "", "returnMode": "previous", "forwardingNode": "" },
  "advanced": { "temperature": 0.2, "skipUserResponse": false,
                "disableRecording": false, "disableLogging": false } }
```

`skipUserResponse: true` = the step acts without waiting for the caller (silent pills, code steps).
Per-node audio overrides retained in old JSON are not active in the current v2
compiler. Use Calls → Conversation feel; see
[interruption scope](../v2-runtime/references/interruptions.md).

## Attached tools on a step (`data.tools[]`)

```json
{ "id": "<uuid>", "name": "...", "description": "...", "behavior": "feed_context" | "feed_context_and_route",
  "toolId": "TL-…", "definition": { ...the tool request definition... },
  "isStaging": false, "excludeResponseFromHistory": false, "retryLimit": 0,
  "responsePathways": [ { "id": "<uuid>", "label": "<TRIGGER variable>", "variable": "<OPERATOR>", "condition": "<VALUE>", "targetId": "<stepId>", "targetName": "..." } ],
  "toolType": "custom_tool" }
```

Two hard facts that cost real migrations:

1. **The field naming in `responsePathways` is deliberately skewed**: `label` = the trigger variable, `variable` = the comparison operator, `condition` = the compared value. Author them in exactly that skew.
2. **`toolType` supports ONLY `custom_tool` and `track`.** There is NO code-tool lane: a snippet-executing tool cannot be expressed as an attached tool in a v2 snapshot. Represent it as a native `customCode` step (same `snippetId`/`snippetVersion`, explicit `variables` input map) followed by a `route` step that carries the old tool's responsePathways as rules + fallback. Never add unknown keys to tool objects — validation is strict.

## The knob dictionary

The [field guide](references/knobs.md) documents important active, editor-only,
dropped and unsupported options. It is not the exhaustive live schema; use the
[node catalog](references/node-catalog.md) and connected schema/docs for fields
not listed. Unknown keys can be rejected or silently ignored depending on the
surface—never invent them from v1 names or compiled output.

## Authoring rules (non-negotiable)

- **During migration, carry content verbatim.** Prompts, conditions, transfer numbers, URLs, snippet pins move byte-for-byte from the source JSON unless an explicit change is approved. For maintenance, make the requested edit and preserve unrelated content; verbatim carriage does not prohibit an authorized prompt change.
- **Org-scoping**: `snippetId`s, `TL-` tool ids, KB ids, and `{{SECRET.*}}` references resolve ONLY in the org that owns them. Push the agent into the owning org or code steps silently no-op.
- **A `customCode` step without `snippetId` is inert** — the runtime executes only the pin, never inline `code`.
- Before saving, validate the supported schema and applicable checks in
  [/norm:validate](../../commands/validate.md). Migration architecture conventions
  are not universal validity requirements. For existing-agent edits follow
  [maintenance](../v2-maintenance/SKILL.md); preserve unchanged pins as id/version
  pairs and verify changed behavior on the exact candidate.
