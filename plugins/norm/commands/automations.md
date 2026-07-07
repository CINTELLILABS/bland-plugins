---
description: "Build and manage Bland automations — 'when X happens, place a call / send an SMS'. Use when the user mentions automations, triggers, event pipelines, scheduled or event-driven calls, pausing/resuming an automation, testing a trigger, why an automation fired (or didn't), a failed execution, or tracing an automated call back to what launched it."
argument-hint: "<what to build, manage, test, or diagnose>"
allowed-tools:
  - "Task"
  - "Read"
  - "mcp__bland__bland_api_get"
  - "mcp__bland__call_bland_api"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__get_bland_doc"
  - "mcp__bland__query_docs_filesystem_bland"
---

# Norm Automations

Work the automations surface through the `norm_automations` agent, which owns the doctrine: the trigger → pipeline → execution mental model, the `/v1/automation/*` route map (event catalog with sample payloads and condition constraints, pipelines + ordered nodes, triggers with AND/OR + change-detection filters, executions with per-node results), dry-run-first testing, and the execution↔call correlation spine (`metadata.automation_execution_id`).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_automations` agent (`Task` tool, `subagent_type: norm_automations`) with the user request verbatim.
2. The agent builds event-first (catalog → pipeline → nodes → trigger), tests with `dryRun: true` before anything can dial, and keeps new triggers inactive until conditions are proven. Live tests and activations are confirm-gated with the blast radius stated; pipeline deletion cascades and is treated as the most destructive action on the surface.
3. Diagnoses run evidence-first: execution `input` → condition results → `nodes_executed` → `error`/placed-call ids, handing call-level forensics to `/norm:review`.
4. Relay the agent's report intact: ids + read-backs for every change, per-condition test outcomes, execution ids with statuses, and the full trace chain for diagnoses.
