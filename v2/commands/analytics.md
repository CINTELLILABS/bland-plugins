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
3. `bland_api_get` the chart on the page's `window` when the request depends
   on traffic.
4. **If the request is a question, stop here and answer from the reads.** No
   design, no pending save, no publish unless a change was asked for.
5. Design the groups; validate offline with the skill's
   `scripts/validate-definition.cjs`.
6. `call_bland_api` PUT the pending draft with `expected_fingerprint`; fix any
   422 by the named ids; on 409 re-read and resend.
7. **Preview first** through `?definition=<pending id>` on the same `window`
   whenever the user asked to preview or see it before it goes live, and
   whenever the change is large or the request was ambiguous. After a preview,
   wait for the user's confirmation; do not publish in the same turn.
8. Otherwise, or once confirmed, `call_bland_api` POST to publish.
9. Re-read on the same `window` and report: stage table, unclassified share,
   `served` as it actually is, and anything the request asked for that a
   definition cannot express, with the surface that can.

The page refreshes itself after a save or publish; never ask for a reload.
Use only the analytics routes for this command.
