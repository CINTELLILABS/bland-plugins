---
name: analytics-cohorts
description: Use when building a list or cohort of conversations that match a condition ("show me the calls where…", "which calls…", "how many calls…"), counting calls by lake columns, filtering by outcome, call length, metadata, tools, webhooks or disposition values, opening a filtered list on the Conversations page, feeding a set of calls to a judge run, or explaining why a condition cannot be expressed. Covers the predicate grammar, offline validation, and the create, poll and ids routes.
---

# Build a conversation cohort

A **cohort** is a materialised, expiring set of call ids. The API builds it
once in the analytics lake from a predicate and a window.

Use a cohort to answer "which calls" or "how many calls" for a condition on
call columns. Use the [Sankey definition](../analytics-authoring/SKILL.md) to
change how journeys are drawn. Use [dispositions](../evaluations/references/dispositions.md)
when the condition is a judgement about what was said.

Read the [grammar](references/grammar.md) before writing a predicate and the
[contract](references/contract.md) before the first request. The usable
columns are in [tables](references/tables.md); what a leaf means is in
[semantics](references/semantics.md).

## Workflow

1. **Read the page context.** Take the agent and window from it. Omit
   `agent_key` only when the user asks for the whole organisation.
2. **Translate the ask into a predicate.** Prefer the simple keys
   (`outcomes`, `metric`, `day`, `hour_utc`) when they say it exactly. Put
   column conditions in `where`, naming only columns in
   [tables](references/tables.md).
3. **Validate offline** with `node scripts/validate-predicate.cjs <request.json>`
   (resolve `scripts/` from this skill's directory). It checks only `where`,
   with the API's rules and messages, and reports `cost_class`. The API
   checks the rest of the body.
4. **Create** with `call_bland_api` POST `/v2/analytics/cohorts`, body
   `{ "agent_key": "<agent>", "window": { "start": "…", "end": "…" }, "predicate": { … } }`.
   A 202 returns `{ id, status: "building" }`.
5. **Poll** with `bland_api_get` on `/v2/analytics/cohorts/<id>`. Wait a few
   seconds between the first reads, then about 15 seconds. Stop at `ready` or
   `failed`. A light predicate on a 30-day window usually takes seconds. A
   heavy one can take minutes.
6. **Report** `size`, `visible_size` and `truncated`, and say in words what
   the predicate selected. The Conversations page opens the list by itself
   once the cohort is ready. Never ask the user to reload or paste an id.
7. **Ids on request only.** Page `/v2/analytics/cohorts/<id>/ids` when the user
   wants the ids, for example to start a judge run
   ([evaluations](../evaluations/SKILL.md)).

Use the two API tools directly. Never script fetch or search the docs for
these routes; the contract is here.

## Refusals

A 400 `COHORT_PREDICATE_INVALID` names the node and the rule, for example
`and[1].col: unknown column: calls.foo`. Fix exactly that node, validate
again, and resend. Every message and its fix is in the
[grammar](references/grammar.md#refusals).

## Limits

- Window: end after start, at most 92 days, start at most 400 days ago.
- At most 50,000 calls. `truncated: true` means the cap was hit: narrow the
  window or the predicate before drawing conclusions from the list.
- Readable for 7 days after it becomes ready, then 404.
- `visible_size` can be lower than `size`: the Conversations list shows only
  completed calls.

## What this cannot express

Say the rule and hand off. Never approximate with a lookalike predicate.

- **One row satisfying two conditions on a joined table.** Each joined leaf is
  its own `EXISTS`. Two leaves on one table can match different rows.
- **Waypoints.** `waypoint` is refused with `COHORT_PREDICATE_UNSUPPORTED`.
  Journey questions belong to the [Sankey](../analytics-authoring/SKILL.md).
- **Text search inside denied columns** (transcripts, summaries, payloads,
  phone numbers). "Calls where the caller asked for a human" is a
  classification. Define a disposition, then filter on its value.
- **Aggregates across calls** (averages, rates, top-N, per-day series). Use
  `query_analytics`.

Worked prompts are in [examples](references/examples.md). Customer metric
routes are not live yet; read the [metrics roadmap](references/metrics-roadmap.md)
before answering a metric request.
