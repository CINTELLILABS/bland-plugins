# V2 resources outside the snapshot

Saving agent JSON does not save every object visible around the agent. Start
with the [API map](api.md), and retrieve the live contract for bodies not listed
there. Host tools expose capabilities; this wiki does not grant access to them.

## Resource ownership and activation

| Resource | Where it lives / becomes effective |
|---|---|
| Behavior, prompts, node settings, knowledge references | Agent version snapshot; trunk save advances dev, not production. |
| Saved tool, snippet, KB content | Separate org-owned resource referenced by a snapshot. Changing a shared resource can affect other consumers. |
| Environment values and secret references | Per agent/environment, separate from snapshot; resolve according to the call/test selector. |
| Environment pins and deployment history | Lifecycle API; saving a draft is not promotion. |
| Branches | Separate working timelines; preserving a branch does not merge or deploy it. |
| Identity and number binding | Separate APIs; carrier submissions, messages and routing changes have external effects. |
| Check configurations / runs | Separate candidate and judge-version records; promotion policy is described in [lifecycle](../SKILL.md). |
| Judges, scenarios, cohorts, evaluation runs | Separate objects; see [evaluations](../../evaluations/SKILL.md). |
| Dispositions and extractor versions | Separate draft/publish/run lifecycle; not agent snapshot fields. See [dispositions](../../evaluations/references/dispositions.md). |
| Calls, conversations, recordings, transcripts, memory records | Runtime evidence/data, not configuration and not a copy of the latest editor. |
| Alerts, automations and integrations | Separate configured resources. Inspect their own contract and agent scope before changing them. |

## Knowledge and memory

- `knowledge.kbIds` attaches agent-wide retrieval; a `knowledge` step scopes
  retrieval differently. Avoid promoting node-only knowledge to call-wide simply
  because it is easier to find. An attached ID does not prove ingestion finished,
  the source is current, or the requested answer was retrieved.
- Inspect the connected knowledge API for ingestion status, supported formats,
  source/chunk management and permissions. Test with an answerable question and
  one deliberately absent answer. Report evidence gaps rather than invent answers.
- `settings.enableMemory` enables the agent's memory behavior;
  `settings.memorySchema` supplies its structured schema. Inferring a schema
  returns a proposal—it does not save that proposal or create historical memories.
- Save the accepted schema in a version, then verify the channel's active version.
  Inbound/SMS also depend on the twin's effective settings; see the lifecycle
  reference. Do not assume changing dev updates production or existing memories.
- Inspect actual contact identity and available memory through the authorized
  API; a schema alone is not evidence a fact was stored. Memory deletion or
  correction is a data mutation, not a prompt edit. Do not invent memory CRUD
  routes from the schema-read endpoint.

## Collaboration and page synchronization

The builder can hold unsaved changes, a saved head/revision, an environment view
and a branch independently. Collaborative presence is not ownership of every
field. Editing leases and version fences still apply; an animation or selected
node does not prove a save or permission.

Use host-provided draft tools and collaboration support when available. For
API-based edits preserve concurrency fields and handle conflicts through the
[workspace procedure](../../api-workspace/references/workspace.md). Do not invent
collaboration tokens, reuse another user's token, or clear a lease to force a save.
After a disconnect, re-read identity, head/revision and pending operation status
before issuing a new mutation. An explicit Sync must not discard an unsaved draft
after its save failed. A cursor follows work; it is not the transport for changes.

## Reuse, history and restoration

- Scenario library entries come from other agents' current dev heads. They are
  reusable source material, not a promise of continuous synchronization.
- Archived nodes are copies. Archiving does not remove the original from its
  canvas. Deleting an archive removes a reusable copy, not an agent's live node.
- Reusing a subtree requires checking IDs, internal references, external tools,
  auth-zone membership and environment dependencies. Do not merely rename the
  top node and leave conflicting child/edge IDs.
- Scenario history supplies snapshots to compare. The `path` of container IDs
  identifies nested scope; a label alone is not a stable identity.
- Restoring a past prompt means a new minimal edit against today's head, not
  blindly replacing the whole agent with an old snapshot. Production rollback is
  a separate lifecycle action with eligible previously deployed versions.
- `GET /:agentId/versions/:versionId/graph` addresses a row UUID and returns
  compiled nodes/edges for historical interpretation. `/versions/:semver` is a
  different full-snapshot route. A compiled graph is not editable snapshot JSON.

## Operational surfaces

For call/conversation investigations, preserve agent/version attribution, channel,
call/thread identity, timestamps and the difference between messages and calls.
Use the returned IDs to retrieve full evidence; one call-list row is not the
complete conversation or all transfer legs. See [call retrieval](../../call-analysis/references/retrieval.md).

For alerts and automations, inspect the selected agent, trigger, evaluation
version/metric, threshold/window, destination and enabled state through their
documented APIs. Running an eval is not enabling an alert; enabling an automation
can create ongoing effects. Do not guess endpoint names or toggle an unrelated
org-wide rule to repair an agent-local issue.

Experiments, identity registration, contact-card sends, number binding, shared
tool changes, disposition publication and deletion all have effects beyond a
local file. Follow the user's requested scope and host permissions, with
verification specific to the resource changed.
