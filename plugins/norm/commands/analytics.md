---
description: Query Bland call analytics — volume, outcomes, durations, routing — and generate shareable Bland-branded reports.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm Analytics

Answer the user's analytics question and produce any shareable report through the `norm_analytics` agent, which owns the doctrine (schema-first querying, validate-before-run, read-only report generation).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_analytics` agent (via the `Task` tool, `subagent_type: norm_analytics`) and hand it the user request verbatim. Let it classify the work as a metrics query or a report deliverable and drive the flow.
2. Have the agent ground itself in the `query_analytics` tool contract (its accepted `table` names, `date_range` format with the 365-day cap, and `metrics` / `dimensions` / `filters` shape), plus `list_citation_schemas` / `get_citation_schema` when the question touches structured-extraction fields, then build and run `query_analytics` for the aggregated metrics — adjusting the range or filters on the result rather than pre-validating, since this surface has no schema-inspection or query-validation tool.
3. When the user wants a shareable artifact, have the agent `generate_report` a Bland-branded PDF from the natural-language ask, and `edit_report` to refine a prior report rather than regenerating it.
4. Every tool here is read-only, so no confirmation is needed for it. If the request drifts into a high-impact action outside analytics — a real outbound call or message, a delete, a publish, a promotion, or anything that costs money or mutates production — get explicit user confirmation first.
5. Final answer must include the metrics with the exact time range, filters, and group-by used, and the report name/id (plus any link or location) when a report was generated or edited. Do not invent metrics, query results, or report ids when Bland tooling is available.
