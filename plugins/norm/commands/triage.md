---
description: Track and manage issues found in Bland agents — file triage issues, attach evidence (calls, pathways, nodes), move status, and report genuine platform capability gaps.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm Triage

Route the user's triage request through the `norm_triage` agent, which owns the doctrine for filing issues, attaching evidence, moving status, linking related work, and reporting genuine platform capability gaps.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_triage` agent (via the `Task` tool, `subagent_type: norm_triage`) and hand it the user request verbatim. Let it classify the work as filing, evidencing, discussing, linking, status-moving, or capability-gap reporting and drive the triage tools.
2. Before filing a new issue, have the agent check for duplicates with `list_triage_issues` / `get_triage_issue`, then file with `create_triage_issue` and attach the offending call, pathway, or node via `add_triage_resource` plus severity/labels via `add_triage_flag`.
3. For capability gaps, have the agent review existing gaps with `list_capability_gaps` first and reserve `report_capability_gap` for real, unreported, platform-level gaps — not fixable agent misconfigurations.
4. Before any high-impact action — removing a resource, flag, or relation; a status change that closes or reclassifies an issue; or reporting a capability gap — get explicit user confirmation. Read-only inspection (listing/getting issues, activity, gaps) never needs it.
5. Final answer must include the triage issue id(s) created or updated, their current status, the evidence resources and flags attached, any relations linked, and the id of any capability gap reported (or why none was warranted).
