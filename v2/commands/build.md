---
description: Build a NEW Bland agent from scratch — always a v2 agent. Loads the v2 authoring doctrine and drives design → snapshot → push → verify, with a human design review before authoring. Use when the user wants to create, build, or design a new voice, chat or text agent, including requests phrased as a new pathway or persona.
argument-hint: "<what the agent should do>"
allowed-tools:
  - "Task"
  - "AskUserQuestion"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Bash"
  - "mcp__plugin_norm_bland__*"
---

# /norm:build — new v2 agent, human-in-the-loop

Request:

```text
$ARGUMENTS
```

## Step 0 — v2 only

This command builds v2 agents only. Load the `v2-authoring` skill (plus `v2-snapshot` for the dialect and `v2-runtime` for behavior) and continue below. Do not ask whether the user wants a v1 pathway: new v1 pathways and personas are not supported. If the request names a v1 pathway, persona or the classic node-graph builder, say so in one sentence and build the v2 agent that does the same job. To carry over an existing v1 pathway or persona, use `/norm:migrate`; the v1 source stays read-only.

## Org-identity smoke check (before the first write)

Multiple Bland connections can coexist in one session; namespace alone proves nothing. Before `create_agent` or any version push, call `list_agents` through THIS plugin's server (`mcp__plugin_norm_bland__*`) and confirm the org is the one the user intends (name a known agent back to them if unsure). On mismatch, stop and ask (BLA-7919).

## v2 build phases

1. **Design interview.** Nail the call's real structure before JSON: what the agent owns end-to-end, the ordinary conversation owned by the hub, which business workflows need strict ordered steps (one scenario per bounded workflow), and their return to the hub, which content is reference material (FAQs, policies, hours, product facts → knowledge sources, not scenarios; see the `v2-authoring` boundary rule), every integration (read vs write), the per-call data contract (request data), transfer destinations, close conditions. Present the scenario architecture in a short table and get a nod before authoring.
2. **Author the snapshot** per `v2-authoring` + `v2-snapshot`: settings.systemPrompt (persona + conduct rules — include the standard no-fabrication set), hub prompt + entries, scenario flows (steps, edges, tools), root end-calls. Keep ordinary status lookups and simple actions in the hub. A separate conversational node needs a required control boundary or repeated evidence of better reliability against the consolidated version on the same frozen cases; simplify a dense hub before adding structure. For anything mechanical that exists as v1 JSON already, use `bin/norm-materialize.cjs` instead of hand-writing.
3. **Audit**: `/norm:validate` structural + routing-crash checks (skip the vs-source parity checks — there is no v1 source).
4. **Create + push**: `create_agent` (or the user's existing agent id) → `save_agent_version` / `POST /v2/agents/:id/versions` with a named version. A new agent runs native function calling from its first saved version; read `settings.nativeToolCalling` on the saved version and author to the [native rules](../skills/v2-migration/references/native-tool-calling-v1.md) ([how to check](../skills/v2-runtime/references/native-function-calling.md)).
5. **Verify**: `/norm:simulate` — full-coverage suite from the design's lanes + the standard conduct probes (no invented times/numbers/bookings, no callback promises, AI disclosure, chant escalation), write-tool temptation probes, green sweep on one head.
6. **Convergence loop (recommended)**: the migrate loop works in BUILD MODE — init the state with NO `--source` (`node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" init --snapshot snapshot.json --agent <id>`): the Stop-hook then gates on the STRUCTURAL audit (parity checks skip with no source) + push-after-edit + sims-green-on-head, same as migrations. Native builds skip the legacy A2 sibling-count rule: a hub plus a real end-call is sufficient when no strict workflow needs a scenario.
7. **Lifecycle**: load [v2-lifecycle](../skills/v2-lifecycle/SKILL.md) and follow
   the supported release mode: publish to staging then promote, or an explicitly
   selected exact-version promotion. State the org and exact candidate before
   changing live traffic; approval to save is not approval to promote. Respect
   the user's explicit authorization and the host's permission policy. Verify
   the current staging check policy and candidate results; pending/failed required
   checks block current-server promotion. Do not add `force` or weaken checks to
   get around a failure. Test-chat defaults to dev, not production. Verify all
   referenced environment values for the environment taking traffic and read
   back the resulting pins/deployment history. No production pin can fail calls;
   inbound fallback behavior is separately described in the lifecycle skill.
