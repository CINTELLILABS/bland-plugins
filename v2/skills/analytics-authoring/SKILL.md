---
name: analytics-authoring
description: Use when building, editing, simplifying, or explaining an agent's analytics Sankey ("Where conversations go"), its waypoint stages or groups, parallel branches, the unclassified share, what the Simplified and Detailed views draw, or why an end state cannot be split. Covers the customer waypoint-definition API (read, validate, save pending, preview, publish), its rules and caps, and the boundary with dispositions for per-call outcome classification.
---

# Author an agent's analytics Sankey

The Sankey on an agent's Analytics page folds real conversation traffic through
a **waypoint definition**: an ordered set of groups, each naming the agent's
compiled waypoints (nodes and tools) it contains. You change the chart by
publishing a new definition for that agent. You never change the agent, its
versions, or its deployment to change the chart.

Read [concepts](references/concepts.md) before your first design, and
[the contract](references/contract.md) before any write. Read
[rendering](references/rendering.md) before promising what the user will see.

## Workflow

1. **Read the page and the agent.** The attached page context names the agent,
   window and filters. Resolve the agent id from it; ask only when it is absent.
2. **Read the live definition** with `bland_api_get` on
   `/v2/analytics/agents/<agent>/pathway/definition`. It returns the production
   version, the structure `fingerprint`, the `members` you may group (exact ids
   and labels), and the `published` and `pending` rows.
3. **Read the current chart** with `bland_api_get` on
   `/v2/analytics/agents/<agent>/pathway?view=simple&layout=stages&window=<n>`
   when the request depends on traffic (which stages are thin, what is
   unclassified, where calls end). Numbers come only from this read; never
   estimate them.
4. **Design the groups** per [design](references/design.md): 3 to 5 business
   stages unless asked otherwise, exact member ids only, plumbing left out,
   siblings that share a `stage` for parallel branches. Keep ids of groups you
   are only relabeling. Respect the caps: at most 7 groups, each member in
   exactly one group.
5. **Validate offline** with `node scripts/validate-definition.cjs <definition.json> <members.json>`
   (resolve `scripts/` from this skill's directory). It applies the same rules
   the API applies and lists violations by id. Fix them before the first PUT.
6. **Save pending** with `call_bland_api` PUT
   `/v2/analytics/agents/<agent>/pathway/definition/pending`, body
   `{ "definition": { "groups": [...] }, "expected_fingerprint": "<fingerprint>" }`.
   A 422 returns `violations`; fix the named ids and resend. A 409 means the
   production pin moved: read the definition again, then resend.
7. **Preview** with `bland_api_get` on
   `/v2/analytics/agents/<agent>/pathway?view=simple&layout=stages&definition=<pending id>`
   when the user wants to see it before it goes live, or when the change is large.
8. **Publish** with `call_bland_api` POST `/v2/analytics/agents/<agent>/pathway/definition`,
   same body. The response carries the new `definition_id` and the superseded one.
   The pending row is consumed.
9. **Confirm** with one more pathway read: `waypoints.customer.lifecycle` is
   `published`, `waypoints.served` is true, and report `unclassified_share`.

Use the two API tools directly for every call. Do not write fetch scripts, do
not search the docs for these routes, and do not call other API families for
this task. One read, one PUT, one POST is a complete turn.

## What to tell the user

- The stage table: stage, group label, member count, and the business meaning.
- `unclassified_share` and what it holds, in business terms.
- The page refreshes itself when a definition is saved or published. Do not ask
  the user to reload.
- When parallel branches were published, say that the Simplified tab merges
  siblings and the Detailed tab shows them apart ([rendering](references/rendering.md)).
- Anything the request asked for that a definition cannot express, named
  precisely, with the surface that can (usually dispositions; see
  [measurement and persistence](references/measurement-and-persistence.md)).
  Never approximate an unexpressible split with a lookalike grouping.

## Boundaries

- A definition regroups, renames and reorders compiled waypoints. It cannot add
  waypoints, change terminal states, or classify calls by anything other than
  the waypoints they visited.
- The three terminals (completed by AI, transferred, hung up) are the engine's
  fixed outcome vocabulary. Splitting a terminal by reason is a dispositions
  task, not a Sankey task.
- Edits apply to the production version's structure. A promotion that changes
  the node or tool set changes the fingerprint; a published definition carries
  forward only when every member still exists.
- Read-only or local-only instructions apply to every write here, including a
  pending save. Say what you would have written instead.

Worked prompts and expected answers are in [examples](references/examples.md).
