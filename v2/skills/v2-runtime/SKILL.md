---
name: v2-runtime
description: How a Bland v2 agent actually behaves at call time — the node routing decision stack (loop conditions, tool response pathways, deterministic edges, model choice), hub/scenario semantics, variable resolution, code-step execution, and the behavioral deltas every author must plan for. Use when predicting or debugging live agent behavior, explaining routing decisions, or answering "why did the call go there".
---

# v2 Agent Runtime Behavior

A v2 snapshot compiles to a flat conversation graph; the same engine that runs pathways runs it. These are the observable rules that govern every call.

## The routing decision stack

At any step, the next hop is decided by the FIRST layer that claims it — in this order:

1. **Tool loop condition (waiting).** A step tool can carry a loop condition on its response. While it is unmet, the step holds: the model keeps conversing on the same step and no routing happens. "Waiting" is not a route the model picks — it is the gate not having released.
2. **Tool response pathways (deterministic).** When an attached tool fires and has `responsePathways`, each row is checked top to bottom against the tool's output (`trigger variable / operator / value`); the first match FORCES the next step. No model judgment.
3. **Deterministic edges and route steps.** Edge `conditions` rows and `route` step rules evaluate mechanically against call variables. A route step with no matching rule falls to `fallbackNodeId`; with no fallback either, the call hard-fails for that caller.
4. **Model choice (last).** Only when nothing above decided does the model pick among the step's outgoing edges, using edge labels + descriptions, the step prompt, the system prompt, and conversation history. A self-loop edge is the model-chosen form of waiting. `alwaysPick: true` edges are forced.

In the builder UI, layer 2 is visible only inside the step's tool inspector panel ("Response pathways — conditions are checked top to bottom"), never as canvas arrows. The canvas shows layers 3–4. Do not diagnose routing from the canvas alone.

## Hub and scenario semantics

- The **hub** (`agent` node) routes BETWEEN caller turns by reading every scenario's `entry.description`. It is generative: it speaks, and it waits for the caller before routing. It cannot be made silent by prompt instruction — if the call must run logic before anyone speaks, re-point the `inbound` edge at a bootstrap scenario.
- **The last step of a scenario never sees the agent's route list.** Its choice set is only that flow's own edges: self-loops plus the flow's exit edges (to the end pill). Choosing an exit hands control back to the hub, which then routes among scenarios as a second hop — possibly within the same between-turn window, which in a trace can look like one decision. It is two.
- Scenario **exits carry intent**: the hub routes on the exit edge's label/description. One exit edge per distinct intent.
- Once inside a scenario, a caller topic-shift can pull the call back to the hub between turns ("hub interruption"). Flows that must hold the caller captive need explicit holds (self-loops with clear conditions, `loopWhile`).

## Variables

- **Extraction rows** on prompt steps extract from conversation each turn; extracted values persist as call variables.
- **`{{placeholder}}` resolution**: strings resolve against call variables (plus `{{SECRET.name}}` from the org's secret store). **An unresolvable placeholder stays in the string as the literal text `{{name}}`** — it does not become empty. Consequences: never let a prompt or a code input depend on a variable that may not exist yet, and never treat "the string is non-empty" as "the variable was set". Web-chat sessions do not resolve built-in clock variables like `{{now_utc}}` — supply a real value in request data when testing time-dependent logic (engine format example: "Monday, September 14, 2026 3:00 PM").
- **request data** (per-call key/values) merge into call variables at call start — this is the call-time contract a caller/integration must supply.

## Code steps (`customCode`)

- Execute their pinned snippet (`snippetId` + `snippetVersion`) via the code runtime **before dialogue**, with the step marked non-conversational — no dead turn is added by the step itself.
- **Input**: ONLY the step's `variables` rows, resolved against call variables. Nothing else reaches the snippet. Map the snippet's complete read-set explicitly; remember the unresolved-literal rule above for first-run state variables.
- **Output**: if the snippet returns an object, its keys merge wholesale into call variables under their own names. Route on those variables in the next step.
- A code step whose snippet id doesn't resolve in the owning org silently no-ops — org-scoping is the first thing to check when "the code didn't run".

## Behavioral deltas to plan for (v2 model limits)

Document these per agent instead of discovering them in production:

- **In-flow hang-ups happen one caller-turn later**: an in-flow "end call" becomes a wrap-up step; the actual hang-up occurs when the hub routes to a root end-call node on the following turn.
- **Global/fire-from-anywhere nodes don't exist**: the hub routes between turns only. Mid-utterance interrupt-and-return semantics are approximated by system-prompt rules plus hub resume.
- **Cross-flow deterministic jumps become hub routing**: a deterministic jump between two scenarios rides an exit edge + hub entry (LLM judgment at the hub). Carry the original conditions verbatim into the entry description, and scope any hub hard rules to exactly what they protect — an unqualified rule like "unverified → identity scenario" bounces wrong-number callers into a greeting loop forever.
- **Attached snippet tools don't exist** — see the snapshot skill for the code-step + route re-representation, including its own deltas (fires on traversal instead of mid-turn; snippet failure falls to the route fallback).
