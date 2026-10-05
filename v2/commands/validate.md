---
description: Audit a v2 agent snapshot before saving — schema, references, routing hazards, and tool pins; apply migration-specific architecture and carriage checks only to migrations.
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

Load the `v2-snapshot` skill for the dialect and the current supported schema.
Classify the task as new authoring, migration, or maintenance. Evaluate each
applicable check mechanically using workspace code; report PASS, FAIL, N/A
(with reason), or NOT VERIFIED. Applicable failures block saving; unsupported
checks are not passes. This checklist is not a substitute for schema validation
or behavioral tests.

For maintenance, preserve the existing design. Migration conventions such as
array-first Start/array-last End are not universal
schema requirements. Do not rebuild a valid agent merely to satisfy them. Check
the actual Start edge and intended termination behavior instead. Source-carriage
checks apply only when migrating; intentional requested edits are allowed.

## Structural

1. Top level has `behavior.nodes`, `behavior.edges`, `settings.systemPrompt` (non-empty).
2. Exactly one `inbound` node and one `agent` (hub) node; the inbound edge targets the hub OR a deliberate bootstrap scenario (if so, confirm that was intended).
3. Every `complex-scenario` has the required entry/name/flow fields for the supported schema. Each flow's Start edge targets its intended entry. Start-first/End-last array ordering is an authoring convention, not executable entry selection.
4. Every node, flow node, edge, rule, condition, and variable row has a unique `id`. No duplicate ids anywhere in the document.
5. Every flow edge's `source`/`target` exist in that flow; every route `targetNodeId`/`fallbackNodeId` exists in that flow.
6. For migration doctrine, require an `end-call`: at the root, or as a step inside a flow that its Start can reach (a v1 End Call migrates to the in-flow form). An in-flow `end-call` covers only its own flow: if any flow hands the call back to the hub, require a root `end-call` too. Otherwise verify the intended termination action/continuation; a missing root end-call is not a failure.

## Routing-crash checks

7. **No empty fallbacks**: every `route` step has a `fallbackNodeId`, or the omission is explicitly documented as a pre-existing defect (v1 or native v2). Report the no-match failure risk and resolve scope before saving; do not silently invent a fallback during an unrelated prompt edit.
8. **OR-collapse scan**: within any single rule, flag conditions that AND the same field against different equality values (e.g. `x equals a` AND `x equals b`) — impossible rules mean flat OR rows were collapsed.
9. Check reachability from the Start edge's actual target, including route rules,
   response pathways, global selection/return, and applicable guardrail targets.
   Being first in the array or having an inbound edge is not proof: an isolated
   cycle can satisfy both. Consult the
   [builder/runtime mapping](../skills/v2-runtime/references/builder-runtime-map.md).
   The bundled migration script's incoming-target check is only a structural
   heuristic, not this full analysis. Report unsupported validation separately;
   do not add cosmetic edges to silence it or call an unresolved check passed.
10. Steps with no outgoing edge and no route onward must be intentional terminals (wrap-ups before the end pill count only via their exit edge).

## Content carriage (when the v1 source is provided)

11. **Pin pairs**: every source snippet (id, version) PAIR appears in the snapshot as a pair — ids and versions checked independently would accept two snippets with swapped versions. `TL-` tool ids present. A missing or mispaired pin is a silent runtime no-op — release blocker.
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

Output: a numbered status table, each FAIL with the JSON path and the one-line
fix, and each N/A or NOT VERIFIED with its reason. Keep schema failures,
behavioral hazards, and migration-only conventions distinct.
