---
name: analytics
description: "Use when the user asks for call metrics, stats or reports for Bland v2 agents (volume, completion, containment, transfers, abandonment, durations, costs, trends, outcomes by version) or wants to build the measurement itself: post-call outcomes as dispositions, headline metric tiles, the analytics Sankey, conversation cohorts, or live analytics dashboards in the Bland UI. Numbers only ever come from reads actually run. Reads are free; creates, publishes and backfills are confirm-gated."
license: MIT
---

# Analytics

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

You never guess at numbers. Every figure comes from a read you ran in this turn, and you name the read behind it. A `null` is "no number yet", not zero.

## Where each question lives

| Question | Read |
|---|---|
| "How is the agent doing", tiles, breakdowns by day or version, `query_analytics` | [measurement](../../v2/skills/analytics-cohorts/references/measurement.md) |
| Add or edit a headline metric tile | [metric tiles](../../v2/skills/analytics-cohorts/references/metrics.md) |
| "Which calls…", "how many calls where…", open them on the Conversations page | [analytics cohorts](../../v2/skills/analytics-cohorts/SKILL.md) |
| Build or simplify the analytics Sankey | [analytics authoring](../../v2/skills/analytics-authoring/SKILL.md) |
| Define what every call produces: outcome categories, fields, verdicts | [dispositions](../../v2/skills/dispositions/SKILL.md) |
| Analyze hundreds or thousands of calls with code | [call analysis](../../v2/skills/call-analysis/SKILL.md) |

## The measurement ladder

Climb only as far as the question needs ([details](../../v2/skills/analytics-cohorts/references/measurement.md)):

1. **Summary tiles:** `bland_api_get` `/v2/analytics/agents/<agent id>/summary` (or `/v2/analytics/org/summary`) with `window`, `tz` and `shape=v2`. These match the Analytics page.
2. **`query_analytics`** for a breakdown the tiles do not have. Tables: `calls`, `agent_hour_stats`, `metric_hour_stats`. It aggregates only: there is no row mode, and it takes no time bucket. For a series by day, week or month on an enterprise org, send the same query to `POST /v2/analytics/query` with `{ "mode": "structured", "query": { … } }`; the POST runs a read and changes nothing.
3. **Cohorts** for "which calls" or to scope a `calls` query to one agent: the `calls` table has no agent column, so pass a ready cohort as `cohort_id`.

## Outcomes are dispositions

A v2 agent's post-call outcomes are dispositions: built from extractors, judges, agent variables or custom code, tested on real calls, published with a billing acknowledgement, and backfilled onto past calls. Follow the [dispositions skill](../../v2/skills/dispositions/SKILL.md). Legacy citation schemas and `/v1/dispositions` scripts can still be read and queried (`source: "citation"`), and the dispositions skill migrates them. Do not create new citation schemas or legacy disposition scripts.

## Dashboard building (live boards in the Bland UI)

Dashboards are boards of panels. A **query panel** is `{ name, module_type: "query", query: <the query_analytics contract>, visualization_type: kpi|line|bar|pie|table|scatter, compare_previous_period? }`. A **code panel** computes over other query panels on the same dashboard (`code_config.inputs[].panel_id`). Dashboards are enterprise and role gated: report a 403, do not retry around it.

- Routes are mounted at `/v2/analytics`: `POST /v2/analytics/dashboards` `{ name, description? }`, then `POST /v2/analytics/dashboards/<id>/panels` per panel; `PATCH` and `DELETE` for both; list and get, and `GET /v2/analytics/dashboards/panel-templates`, with `bland_api_get`.
- Run each panel's query once with `query_analytics` to prove it returns sane data before you create the panel.
- Read the dashboard back and report the panel list as evidence.

## Guardrails

- Reads are free: the summaries, `query_analytics`, cohort reads, every `bland_api_get` and the docs tools.
- Writes through `call_bland_api` are confirm-gated: dashboards and panels, metric tiles, dispositions, cohorts. Backfills are billed: state the scope (definition × call count) in the confirmation.
- Derived figures (rates, deltas) show the raw numbers they came from. Never average hourly rates; sum numerators and denominators.
- Anything you create is unverified until read back or test-run. Quote the read-back.
- Never echo the API key.

## Reporting

Lead with the answer in plain language, then the numbers. State the window, time zone, filters, grouping and any cap (365 days, row limit). Name the read behind each number. When a drill-down ran, list the cohort id or call ids and hand individual calls to `call-review`.
