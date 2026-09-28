---
name: v2-runtime
description: Use when predicting or debugging Bland v2 runtime behavior, explaining routing or interruptions, or reconciling edited snapshot JSON with the builder canvas, hidden routes, and call traces.
---

# v2 Agent Runtime Behavior

> **Server binding (v1/v2 isolation):** all API work in this skill goes through THIS plugin's MCP server only (`plugin_norm_bland` — `mcp__plugin_norm_bland__*` on Claude Code). Never call the v1 plugin's server or a project-scoped `bland` server, even though they expose similar tools — they may be authenticated to a DIFFERENT organization. Identity is proven by the org smoke check, never by tool namespace.


A v2 snapshot compiles to a flat conversation graph; the same engine that runs pathways runs it. These are the observable rules that govern every call.

Read [builder/runtime mapping](references/builder-runtime-map.md) when nodes look
disconnected or a JSON edit has no visible effect. Read
[interruptions](references/interruptions.md) for audio barge-in, scenario changes,
global-node returns, and active versus retired setting scopes.
Read [execution phases](references/execution-order.md) for preparation, turn
processing and post-call order; [tools and handoffs](references/tools-and-handoffs.md)
for code pins, webhook outcomes, repeated tools, and cold/warm transfer evidence.

## The routing decision stack

For ordinary step routing, inspect these mechanisms before blaming model choice.
This is not an exhaustive universal priority order: global-node selection,
verification gates, after-run actions, and component routing also affect the
result. Use the actual decision trace and the interruption reference.

1. **Tool loop condition (waiting).** A step tool can carry a loop condition on its response. While it is unmet, the step holds ordinary onward routing and the model keeps conversing on the same step. This is not a blanket prohibition on global diversion or other exceptional routing; check their separate eligibility gates. "Waiting" is not a route the model picks — it is the gate not having released.
2. **Tool response pathways (deterministic).** When an attached tool fires and has `responsePathways`, conditional rows are checked top to bottom against the tool's output (`trigger variable / operator / value`); the first matching condition FORCES the next step. **`Default/Webhook Completion` is a deferred fallback, regardless of its array position**: it is used only when no conditional row matches. If multiple default rows exist, the first supplies the fallback. A default row before `success == true` does not steal a successful response; do not reorder it to fix that imagined bug. Ordinary broad conditions are still first-match, not deferred defaults. No model judgment.
3. **Deterministic edges and route steps.** Edge `conditions` rows and `route` step rules evaluate mechanically against call variables. A route step with no matching rule falls to `fallbackNodeId`; with no fallback either, the call hard-fails for that caller.
4. **Model choice (last).** Only when nothing above decided does the model pick among the step's outgoing edges, using edge labels + descriptions, the step prompt, the system prompt, and conversation history. A self-loop edge is the model-chosen form of waiting. `alwaysPick: true` edges are forced.

In the builder UI, layer 2 is configured inside the step's tool inspector panel ("Response pathways — conditions are checked top to bottom"), not ordinary canvas arrows. The canvas shows authored ordinary edges; route-step rules and fallback destinations also live in inspectors, and generated routes need not appear. Do not diagnose routing from the canvas alone.

## Hub and scenario semantics

- The **hub** (`agent` node) is conversational and uses its available routes,
  including eligible generated entry routes—not every stored entry from every
  location. If logic must run before the hub speaks, choose an intentional
  bootstrap entry rather than relying on a “stay silent” instruction.
- A complex scenario runs its nested flow; Start's outgoing edge selects entry,
  and End marks a component exit rather than a phone hang-up. Outer continuation
  can use explicit routes, generated sibling-entry routes, or fallback to the hub.
  **A mandatory extra hub hop is not the current compilation rule.**
- Scenario **exits carry intent**: preserve one exit edge per distinct outcome
  and inspect its relationship to the outer continuation and destination entry.
- A caller topic change, global-node selection, and audible interruption are
  separate events. A root sibling route does not prove arbitrary inner-step
  jumps. Inspect loop state, available routes, and the chosen-node trace.

## Variables

- **Extraction rows** on prompt steps extract from conversation each turn; extracted values persist as call variables.
- **`{{placeholder}}` resolution**: strings resolve against call variables (plus `{{SECRET.name}}` from the org's secret store). **An unresolvable placeholder stays in the string as the literal text `{{name}}`** — it does not become empty. Consequences: never let a prompt or a code input depend on a variable that may not exist yet, and never treat "the string is non-empty" as "the variable was set". Web-chat sessions do not resolve built-in clock variables like `{{now_utc}}` — supply a real value in request data when testing time-dependent logic (engine format example: "Monday, September 14, 2026 3:00 PM").
- **request data** (per-call key/values) merge into call variables at call start — this is the call-time contract a caller/integration must supply.
- **`{{env.KEY}}` is a different namespace with opposite failure semantics**: environment variables (per agent per environment) substitute into the snapshot at call PREPARATION, before the call exists — and a referenced key with no value in the resolving environment fails the call loudly (`AGENT_VARIABLE_UNRESOLVED`), it never passes through as a literal. Plain `{{key}}` and `{{env.KEY}}` cannot collide, and request data cannot shadow an env variable. Which environment's values resolve is decided by the version SELECTOR, not the version: semver/`branch:`/`dev` selectors always resolve dev values, even for the production-pinned version (full model: the `v2-lifecycle` skill).

## Which version is the call even running

Before debugging behavior, confirm the bytes: outbound calls and inbound voice run the **production pin** by default; web chat and test-chat run the **dev head**; SMS on a bound number runs the **twin pathway's stored graph** (refreshed only on attach and production repoints). Inbound resolution is fail-open on a 2s budget — an unpinned/invalid production or unresolved env variable silently degrades the call to the twin's stale compile, unattributed. "The fix didn't take" is usually one of these, not routing. Full lifecycle model: the `v2-lifecycle` skill.

## Guardrails at runtime

`settings.guardrails` resolve straight off the snapshot on every call. Timed TCPA rails (`endSeconds` 1–600) fire their actions if the disclosure hasn't happened within the window from call start; `custom` rails are live LLM evaluators running on EVERY agent turn (hence the cap of 5). Actions: end_call / transfer / move_to_node. When a call ends or transfers "for no visible reason", check the rails before the routing stack.

## Code steps (`customCode`)

- Execute their pinned snippet (`snippetId` + `snippetVersion`) via the code runtime **before dialogue**, with the step marked non-conversational — no dead turn is added by the step itself.
- **Input**: ONLY the step's `variables` rows, resolved against call variables. Nothing else reaches the snippet. Map the snippet's complete read-set explicitly; remember the unresolved-literal rule above for first-run state variables.
- **Output**: if the snippet returns an object, its keys merge wholesale into call variables under their own names. Route on those variables in the next step.
- A code step whose snippet id doesn't resolve in the owning org silently no-ops — org-scoping is the first thing to check when "the code didn't run".

## Behavioral deltas to plan for (v2 model limits)

Document these per agent instead of discovering them in production:

- **A flow exit is not a hang-up**: an in-flow end-call construct can be a
  wrap-up step; verify that continuation reaches an actual termination action.
  A root end-call can be a generated sibling destination. Do not require a hub
  visit or promise a fixed extra caller-turn count from the canvas alone.
- **Fire-from-anywhere defaults don't exist at the hub** — it routes between turns only. HOWEVER, step-level globals DO exist: `settings.global.isGlobal` compiles a step into a runtime global node with auto-return (`returnMode: previous`), redirect, or manual modes (see the knob dictionary). Migrations have preferred systemPrompt folds for carried v1 globals; a deliberate new design may use step globals directly.
- **Cross-flow routing needs an explicit mapping check**: a nested step's exit
  and the root continuation are different scopes. Root sibling routes can be
  generated without a hub detour, but that does not make an arbitrary jump into
  another flow equivalent to the source graph. Preserve criteria and verify the
  executed route; do not insert a hub hop or broaden entry rules to match a diagram.
- **Attached snippet tools don't exist** — see the snapshot skill for the code-step + route re-representation, including its own deltas (fires on traversal instead of mid-turn; snippet failure falls to the route fallback).
