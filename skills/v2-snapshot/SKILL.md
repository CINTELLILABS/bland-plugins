---
name: v2-snapshot
description: The Bland v2 agent snapshot dialect — the exact JSON shape of an agent version (behavior graph, hub, complex scenarios, flow steps, edges, tools, settings) and the rules for authoring one by hand. Use whenever reading, writing, or debugging an agent_versions snapshot, pushing a version via POST /v2/agents/:id/versions, or carrying content into a snapshot during migration.
---

# The v2 Agent Snapshot Dialect

> **Server binding (v1/v2 isolation):** all API work in this skill goes through THIS plugin's MCP server only (`plugin_norm_bland` — `mcp__plugin_norm_bland__*` on Claude Code). Never call the v1 plugin's server or a project-scoped `bland` server, even though they expose similar tools — they may be authenticated to a DIFFERENT organization. Identity is proven by the org smoke check, never by tool namespace.


A v2 agent version is one JSON document (the "snapshot"). The platform compiles it deterministically into a flat conversation graph at call time — there is no separate v2 runtime. What you author is what runs. Everything below is the exact wire dialect, taken from real production snapshots.

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
- Push with `POST /v2/agents/:agentId/versions`, body `{"snapshot": {...}, "name": "optional version name"}`. The server validates the snapshot and rejects malformed ones — treat a 4xx here as YOUR bug. An unnamed push may coalesce into an unnamed head version; name versions you want to keep addressable.

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

The `description` is the routing contract: the hub model reads all entries after each caller turn and picks. Carry routing criteria **verbatim from the source of truth** (in migrations: the v1 route conditions / persona pathway_conditions). `rule` is a short human summary of what the scenario owns.

## flow.nodes — the steps inside a complex scenario

Order: `[{type:"start"}, ...steps..., {type:"end"}]`. The `start` and `end` pills are required; the end pill is the exit — an edge to it returns control to the hub. Every node, edge, rule, condition, and variable row carries a unique `id` (UUID). Positions (`position: {x,y}`) are cosmetic but expected.

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
"variables": [{ "id": "<uuid>", "key": "sales_reason", "value": "<what to extract / or a {{placeholder}} for code inputs>" }]
```

On `prompt` steps, rows are LLM extraction: `value` describes what to extract. On `customCode` steps, rows are the snippet's INPUT map: the runtime sends the snippet ONLY these mapped values (resolved against call variables) — nothing else. Map the snippet's full read-set explicitly, e.g. `{"key": "said_name", "value": "{{said_name}}"}`. An unresolved `{{placeholder}}` passes through as the literal string — see the runtime skill for why that matters.

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
- Exits: draw one edge per DISTINCT exit intent from a step to the end pill, each with its own label — never merge two intents into one exit edge (the hub loses the intent).

### Step settings

```json
"settings": { "tag": null, "media": [],
  "global": { "isGlobal": false, "label": "", "description": "", "returnMode": "previous", "forwardingNode": "" },
  "advanced": { "temperature": 0.2, "interruptionThreshold": null, "skipUserResponse": false,
                "blockInterruptions": false, "interruptibility": null, "disableRecording": false,
                "disableLogging": false, "backgroundTrack": "" } }
```

`skipUserResponse: true` = the step acts without waiting for the caller (silent pills, code steps).

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

## Authoring rules (non-negotiable)

- **Carry content verbatim.** Prompts, conditions, transfer numbers, URLs, snippet pins move byte-for-byte from the source JSON. Never paraphrase, never retype — copy programmatically.
- **Org-scoping**: `snippetId`s, `TL-` tool ids, KB ids, and `{{SECRET.*}}` references resolve ONLY in the org that owns them. Push the agent into the owning org or code steps silently no-op.
- **A `customCode` step without `snippetId` is inert** — the runtime executes only the pin, never inline `code`.
- After authoring, run the `/norm:validate` audit before any push, and prove the pins survived: grep the final snapshot for every snippet id and tool id the source used.
