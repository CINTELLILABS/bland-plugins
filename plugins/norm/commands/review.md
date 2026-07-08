---
description: "Review and debug a real Bland call — find it (by window, number, batch, outcome, duration, error), fetch its full log set, classify the node-by-node pathway logs, and get an evidence-quoted verdict on why it failed. Use when a call routed wrong, looped, dropped, hit voicemail, failed a webhook/tool, mis-extracted a variable, or you need to sweep a cohort of calls for a pattern."
argument-hint: "<call_id | 'find …' filter description | review task>"
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Grep"
  - "mcp__bland__get_call_log"
  - "mcp__plugin_norm_bland__get_call_log"
  - "mcp__bland__get_pathway_context"
  - "mcp__plugin_norm_bland__get_pathway_context"
  - "mcp__bland__bland_api_get"
  - "mcp__plugin_norm_bland__bland_api_get"
  - "mcp__bland__search_bland_docs"
  - "mcp__plugin_norm_bland__search_bland_docs"
  - "mcp__bland__get_bland_doc"
  - "mcp__plugin_norm_bland__get_bland_doc"
  - "mcp__bland__query_docs_filesystem_bland"
  - "mcp__plugin_norm_bland__query_docs_filesystem_bland"
---

# Norm Call Review

Review and debug real Bland calls through the `norm_review` agent, which owns the full doctrine: call discovery via the `/v1/calls` filter cookbook, the field-by-field call-record and `pathway_logs` anatomy (entry classification by `pathway_info` keys, `[!!!]` issue markers), local workspace materialization for heavy calls, and reconciliation of observed behavior against the pathway's runtime contracts via `get_pathway_context`.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_review` agent (`Task` tool, `subagent_type: norm_review`) and hand it the user request verbatim. A bare call id → deep single-call review; a description ("failed calls from yesterday's batch", "short calls to +1…") → it finds the cohort first, reports per-call one-liners, then deep-dives the interesting ones.
2. The agent is entirely read-only (no calls placed, no writes to the server) and reasons over fetched data — the verdict is its own analysis, evidence-quoted, never a claimed server verdict.
3. Relay the agent's report intact: verdict, root cause tied to a specific node/edge/variable/tool, decisive quoted evidence, and the recommended fix surface with handoff (`/norm:norm` to fix the pathway, `/norm:triage` to file it, `/norm:loop --from-call <id>` to turn the call into a regression target).
