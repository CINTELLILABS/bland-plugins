---
description: Query Bland call analytics — volume, outcomes, durations, routing — and return shareable, ready-to-render report payloads.
argument-hint: "<your analytics question, or the report you want>"
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__query_analytics"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__query_docs_filesystem_bland"
---

# Norm Analytics

Answer the user's analytics question and assemble any shareable report payload through the `norm_analytics` agent, which owns the doctrine (schema-first querying, validate-on-the-result, metrics-first reporting).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_analytics` agent (via the `Task` tool, `subagent_type: norm_analytics`) and hand it the user request verbatim. Let it classify the work as a metrics query or a report deliverable and drive the flow.
2. Have the agent ground itself in the `query_analytics` tool contract (its accepted `table` name, the `date_range` `since`/`until` format with the 365-day cap, and the `metrics` / `dimensions` / `filters` / `order_by` shape — including the per-metric `source` of `call` / `citation` / `disposition`), then build and run `query_analytics` for the aggregated metrics — adjusting the range or filters on the result rather than pre-validating, since this surface has no separate schema-inspection or query-validation tool.
3. When the question touches structured-extraction fields (a value captured per call, not a built-in column), have the agent discover the available fields docs-first: `search_bland_docs` for the citation-schema endpoints, then `bland_api_get { path: "/v1/citation_schemas/list" }` for all schemas and `bland_api_get { path: "/v1/citation_schemas/<id>" }` for a specific one — confirming exact field names and types before grouping or filtering by them.
4. When the user wants a shareable artifact, the agent returns a **report payload**, not a PDF: the exact `query_analytics` call(s) it ran, the computed metrics, and a Bland-branded title/framing/section outline. PDF/report rendering is out of this MCP surface — it is owned by the user or the server-side analytics renderer, which takes this payload as input. (There is no documented report-generation REST endpoint; only use `call_bland_api` against one if `search_bland_docs` surfaces a real, documented endpoint — never invent one.)
5. Every analytics query and citation-schema read here is read-only, so no confirmation is needed for it. If the request drifts into a high-impact action outside analytics — a real outbound call or message, a delete, a publish, a promotion, or anything that costs money or mutates production — get explicit user confirmation first.
6. Final answer must include the metrics with the exact time range, filters, and group-by used, plus — when a report was requested — the full report payload (the verbatim `query_analytics` call(s), the metrics, and the title/section outline) so the user or the renderer can produce the artifact. Do not invent metrics, query results, or report ids.
