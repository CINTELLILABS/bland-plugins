---
description: Mechanically audit a v2 agent snapshot JSON before pushing — structural checks, routing-crash checks, pin presence, exit-label discipline, and the migration trap checklist. Use before every version push and whenever a snapshot misbehaves.
argument-hint: "<path to snapshot JSON (and optionally the v1 source JSON to audit against)>"
allowed-tools:
  - "mcp__plugin_norm_bland__*"
  - "Read"
  - "Bash"
  - "Glob"
  - "Grep"
---

# /norm:validate — snapshot audit

Audit the snapshot at:

```text
$ARGUMENTS
```

Load the `v2-snapshot` skill for the dialect. Run EVERY check; report each as PASS/FAIL with the offending JSON path. All must pass before a push. Use jq/python — never eyeball.

## Structural

1. Top level has `behavior.nodes`, `behavior.edges`, `settings.systemPrompt` (non-empty).
2. Exactly one `inbound` node and one `agent` (hub) node; the inbound edge targets the hub OR a deliberate bootstrap scenario (if so, confirm that was intended).
3. Every `complex-scenario` has `entry.description` (non-empty), `name`, and a `flow` whose nodes start with `start` and end with `end`.
4. Every node, flow node, edge, rule, condition, and variable row has a unique `id`. No duplicate ids anywhere in the document.
5. Every flow edge's `source`/`target` exist in that flow; every route `targetNodeId`/`fallbackNodeId` exists in that flow.
6. At least one root `end-call` node exists.

## Routing-crash checks

7. **No empty fallbacks**: every `route` step has a `fallbackNodeId`, or the omission is explicitly documented as a carried v1 defect.
8. **OR-collapse scan**: within any single rule, flag conditions that AND the same field against different equality values (e.g. `x equals a` AND `x equals b`) — impossible rules mean flat OR rows were collapsed.
9. Every flow step is reachable (has an inbound edge, is the first step, or is a route/tool-responsePathway target).
10. Steps with no outgoing edge and no route onward must be intentional terminals (wrap-ups before the end pill count only via their exit edge).

## Content carriage (when the v1 source is provided)

11. **Pin grep**: every `snippet_id`, `snippet_version`, and `TL-` tool id present in the v1 source appears in the snapshot the expected number of times. A missing pin is a silent runtime no-op — release blocker.
12. Transfer numbers, webhook URLs, and header sets in the snapshot byte-match the source. Diff each; any difference must be an explicitly documented delta.
13. No v1 `type:"code"` attached tool was carried as an attached tool — each must have become a `customCode` step (with a non-empty `variables` input map) + route step.
14. Exit-edge discipline: for each source node with multiple cross-region exits, the snapshot has one end edge per distinct label — no merged labels (flag " / " in exit labels).
15. `snapshot.knowledge`/agent-level KB exists ONLY if the v1 KB was call-wide.

## Tool rows

16. Every attached tool has `toolType` `custom_tool` or `track`, and responsePathways rows use the field skew correctly (`label`=trigger, `variable`=operator, `condition`=value) with resolvable `targetId`s (empty target = continue, must be intentional).
17. No unknown/extra keys on tool objects.

## Hygiene

18. No plaintext credential printed into your report output (check headers/URLs before quoting them — redact).
19. Unresolvable `{{placeholders}}` in prompts flagged (they render as literal text at runtime).

Output: a numbered PASS/FAIL table, each FAIL with the JSON path and the one-line fix.
