---
description: Review and debug a real Bland call — fetch its transcript, routing/decision logs, variables, recording, and summary, then form a semantic verdict (was the goal met, where did it fail) by reading the fetched data.
argument-hint: "<call_id or review task>"
allowed-tools:
  - "Task"
  - "Read"
  - "mcp__bland__get_call_log"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__get_bland_doc"
  - "mcp__bland__query_docs_filesystem_bland"
---

# Norm Call Review

Review and debug a real Bland call through the `norm_review` agent, which owns the doctrine (fetch the call's full log set → read transcript + routing logs turn by turn → form the semantic verdict yourself → hand a confirmed bug off as a reconstructed regression scenario).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_review` agent (via the `Task` tool, `subagent_type: norm_review`) and hand it the user request verbatim. If `$ARGUMENTS` contains a call id, pass it through; if not, the agent finds the call via the passthrough first (`bland_api_get /v1/calls` with a `limit`).
2. The agent fetches the call's full detail with the curated `get_call_log` tool — the transcript (`concatenated_transcript` + `transcripts[]`), the node-by-node routing/decision log (`pathway_logs[]`), the extracted `variables`, `recording_url`, `summary`, `metadata`, and outcome. It reads them turn by turn, reconstructs which node was active and which edge/decision fired, and forms its OWN semantic verdict — was the goal met, what was extracted, exactly where it broke. There is no server-side analyzer; the reasoning is the agent's.
3. The agent ties the root cause to a specific node / edge / variable / tool, and cross-references the pathway with `/norm:clone <pathway_id>` (from the call's `pathway_id`) when the fix lives in the pathway.
4. Regression tests: there is no curated tool or `/v1` endpoint that auto-generates a Helix test from a call on this surface (the old `generate_from_call` is gone). For a confirmed bug the agent reconstructs the scenario by hand from the transcript and verdict and hands it to `/norm:evals` or `/norm:test`; it does not claim an auto-generated test.
5. This command is read-only: it never places a call, sends a message, or re-fires a webhook.
6. Final answer must include the call id, the goal verdict (explicitly the agent's own analysis of the fetched transcript + logs), the root cause tied to a specific node/edge/variable/tool, the decisive evidence (quoted transcript turns and `pathway_logs` decision lines), and the call's `pathway_id` for follow-up.

Endpoints are discovered from the official docs (`search_bland_docs` → `get_bland_doc`, and `query_docs_filesystem_bland`), never guessed. The call's data is fetched JSON, not local files — there is no mount step.
