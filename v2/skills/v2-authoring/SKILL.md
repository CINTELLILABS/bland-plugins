---
name: v2-authoring
description: Designing and building a NEW Bland v2 agent from scratch — scenario architecture (what scenarios represent and where boundaries belong), hub + entry authoring, step/edge/tool design, the standard conduct-rule set, and how v2 building differs from v1 pathway building. Use when creating a new v2 agent, designing its scenarios, or when someone asks how building in v2 differs from v1. If the user has not said v1 or v2, ASK before applying this doctrine.
---

# Building v2 Agents (from scratch)

Before server work, read [API tool selection](../api-workspace/references/api.md#named-endpoint-fallback). Overrides proxy-only instructions.

> **Server binding (v1/v2 isolation):** all API work in this skill goes through THIS plugin's MCP server only (`plugin_norm_bland` — `mcp__plugin_norm_bland__*` on Claude Code). Never call the v1 plugin's server or a project-scoped `bland` server, even though they expose similar tools — they may be authenticated to a DIFFERENT organization. Identity is proven by the org smoke check, never by tool namespace.


This is the authoring doctrine for NEW agents. The snapshot dialect lives in `v2-snapshot`; runtime behavior in `v2-runtime`. If the user hasn't chosen v1 vs v2, ask first — the disciplines don't mix.

Before changing apparently disconnected JSON, read the
[builder/runtime mapping](../v2-runtime/references/builder-runtime-map.md).

## How v2 building differs from v1 (the mental shift)

| v1 pathway habit | v2 agent reality |
|---|---|
| One flat node graph; you wire everything | A HUB routes between SCENARIOS; each scenario is a self-contained flow |
| Global-node routing | Step globals exist through `settings.global`, with previous/redirect/manual continuation. Keep conduct rules in `settings.systemPrompt`; distinguish router selection from audio barge-in. |
| globalPrompt per pathway | ONE `settings.systemPrompt` for the whole agent — scope sections explicitly when different flows need different rules |
| Custom Code nodes with snippet pins | `customCode` steps — same pins, but inputs are ONLY the step's `variables` map (author the full read-set explicitly) |
| Library tools by id (TL-…) fetched at runtime | Tools embedded in the step's `tools[]` definition (TL- id optional); response pathways route deterministically on tool output |
| Route nodes everywhere | Route steps still exist, but many v1 routes were compensating for no-hub — in v2, distinct intents are often hub entries instead |
| "Transfer Pathway" between pathways | Map the source transition to the actual target construct; scenario-wrapper entry follows its Start edge. Root sibling routes need not detour through the hub. A telephone transfer is a separate operation. |

## What a scenario represents (the core design decision)

The hub is the conversational home. Keep most business logic, questions,
knowledge answers, simple tool actions, intent changes and follow-ups there.
Multiple caller goals may share the hub. Consolidate as far as required behavior
allows; do not build a node per question, tool call, department or test case.

A scenario is a bounded business workflow that needs strict ordered behavior:
for example scheduling (check availability, confirm, book) or complex identity
verification. Its steps exist to enforce a prerequisite, action, decision or
recovery boundary. Tool use alone does not require a scenario. Use a simple
scenario only when its separate execution contract adds value beyond the hub.

Reference content belongs in knowledge sources: FAQs, policies, hours, pricing
and product facts can share a source; never create a scenario per FAQ topic.
Use agent-wide `knowledge.kbIds` for reference any phase may need, and a
`knowledge` step when a workflow must consult it. Verify retrieval on every
required channel before relying on agent-wide references. Older runtimes may
need a tested knowledge-step fallback; report that limitation explicitly
([how knowledge reaches a call](../knowledge-sources/references/how-it-works.md)).

On completion, return to the hub for the next caller need. For an intent change,
exit safely, preserve collected information and resolve unfinished work. An FAQ
need not exit a workflow. Re-entry follows the configured Start edge; explicitly
persist and test any resume state instead of assuming a saved program counter.
Never disable the hub by sending every call into one catch-all scenario.

## Standard skeleton for a new agent

1. **Start:** empty by default. Use only when necessary for call screening or
   automated pickup/IVR navigation. It hands control to the hub once connected.
2. **Hub:** owns ordinary conversation and simple business actions. Explicitly
   route into a strict workflow when eligible; do not duplicate that workflow's
   protected actions in hub prose or promise success without tool evidence.
3. **Scenarios:** only the bounded workflows that need strict steps. State each
   one's entry, outcome, state, cancellation/failure exits and return to hub.
4. **End call:** a real termination action when the caller is finished. Workflow
   completion alone is not a reason to hang up.

Initialization is separate pre-answer setup: use a pinned snippet only when
required before speaking. Do not move the call body into initialization routes,
Start, or `entryScenarioId`. These are runtime mechanisms, not shortcuts around
the hub-first design. Keep global facts and conduct in their supported scopes.

## The standard conduct-rule set (systemPrompt)

Every fabrication class below produced a real incident in production testing. Include these rules in every new agent, tailored to its domain:

- **Nothing is true unless a tool said so**: a booking/reservation/change happened only if the tool returned success on THIS call; a specific slot/time exists only if the availability tool returned it; never invent example times under pressure.
- **Phone numbers are copied, never recalled**: any number spoken must come digit-for-digit from a config variable on this call; if there isn't one, offer to connect instead. (Models recite plausible local numbers from memory — repeatedly.)
- **No side-effect promises the system can't keep**: no callbacks, notes, or "the team will reach out" unless a tool actually creates that artifact.
- **Write-tool gates tie to the caller's LAST turn**: a confirmation argument may only be "yes" if the caller explicitly confirmed in their most recent turn — a deferral is never confirmation. Scope every such guard to the exact moment it protects ("applies ONLY at the final submit; never prevents checking availability") — unscoped guards leak into adjacent behavior.
- AI disclosure (confirm plainly, continue), repeated-word person-chants ("agent, agent") → immediate human handling, language switch offered as a question and then sticky.

## Deterministic where it matters

- Model choice is the LAST routing layer (see `v2-runtime`). Anything correctness-critical rides deterministic constructs: route steps on tool-output variables, tool response pathways, `alwaysPick` edges after code steps.
- A step whose only job is silent routing/extraction should be a static pill (`useStaticText: true`, prompt ".") with its rules in the VARIABLE descriptions — a generative step with "stay silent" instructions will eventually speak, and what it says will be invented.
- Every route step gets a fallback. Every write tool gets a temptation probe in the sim suite.

## Verification is part of building

A new agent isn't built until `/norm:simulate` sweeps green on one head: one scenario per lane/terminal + the conduct probes above + write-tool temptation probes, personas completable, judges worded to the DESIGN's intended behavior (you have no v1 source to mirror — the design interview's outcomes are the bar). Expect run-to-run oscillation from LLM judges and live APIs; classify from engine traces, fix in the right layer (harness vs prompt vs construct).
