---
description: Build, edit or simplify the analytics Sankey ("Where conversations go") for the agent on the current page — waypoint stages, parallel branches, labels, the unclassified share — by reading, validating, saving and publishing a customer waypoint definition through the Bland API. Use from an agent's Analytics page; also explains what the chart cannot express and hands that to dispositions.
argument-hint: "<what to change or ask about the Sankey>"
allowed-tools:
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Bash"
  - "mcp__plugin_norm_bland__*"
---

# /norm:analytics — author the agent's Sankey

Request:

```text
$ARGUMENTS
```

Load the [analytics authoring skill](../skills/analytics-authoring/SKILL.md)
and follow its workflow exactly:

1. Resolve the agent, window and filters from the attached page context.
2. `bland_api_get` the definition (members, fingerprint, published, pending).
3. `bland_api_get` the chart when the request depends on traffic.
4. Design the groups; validate offline with the skill's
   `scripts/validate-definition.cjs`.
5. `call_bland_api` PUT the pending draft with `expected_fingerprint`; fix any
   422 by the named ids; on 409 re-read and resend.
6. Preview through `?definition=<pending id>` if the change is large or the
   request was ambiguous; otherwise `call_bland_api` POST to publish.
7. Re-read and report: stage table, unclassified share, served state, and
   anything the request asked for that a definition cannot express, with the
   surface that can.

The page refreshes itself after a save or publish; never ask for a reload.
Use only the analytics routes for this command.
