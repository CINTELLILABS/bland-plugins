# Workspace, saved state, and the user's page

## Four distinct states

| State | Authority | What changing it means |
|---|---|---|
| Workspace file | A local working copy / evidence artifact | No platform write by itself |
| Unsaved browser draft | The user's current editor state | May differ from the saved API response |
| Saved agent version | The API's accepted snapshot | A trunk save changes dev; it does not promote production |
| Page rendering | What the dashboard currently displays | Can lag behind either a draft edit or an API write |

For exact save/version/publication behavior read [lifecycle](../../v2-lifecycle/SKILL.md).

## At the start of a task or resumed turn

1. Discover the host's injected page-context and resource files from its supplied
   instructions/manifest. Do not assume `/workspace/agent.json` or any fixed path.
2. Read identity, resource IDs, saved version/revision, page/context revision,
   capture time, and whether the payload contains unsaved edits—when provided.
3. If these are missing or stale, refresh through the supported context/API tools.
   An old file surviving a session does not prove it still describes this page.
4. Use the unsaved draft for “edit what I'm looking at.” Use the saved API
   version for “inspect the saved agent.” If they conflict and the intent is
   ambiguous, explain the difference before overwriting either.
5. Keep the fetched/injected source intact. Create a working copy and a small
   manifest containing provenance, revisions, and the task's intended changes.
   These filenames are your workspace convention, not a platform API contract.

Suggested task-local files: `source.json`, `working.json`, `changes.json`,
`verification.json`, and `report.md`. Keep large call evidence separately.
Never overwrite a host-owned injection file expecting it to save the resource.

## Edit through code, then synchronize deliberately

- Read the complete relevant JSON object; use stable node/step IDs, not visual
  positions or array indices that another edit can reorder.
- Make the smallest patch; preserve unknown/unrelated fields and existing IDs.
- Parse the result, run available schema/audit checks, and inspect the diff.
  A migration audit is not a complete replacement for the live snapshot schema.
- Apply via the host's supported draft-update mechanism if the target is an
  unsaved draft; otherwise save through the documented version API. Do not
  silently save an unsaved draft merely to make a screenshot look current.
- Honor `parent_version_id` / `parent_revision` when supported. On `STALE_HEAD`,
  fetch and reconcile; never blindly overwrite the new head.
- Read back the accepted state and compare the fields actually changed. Keep
  the returned version/revision as the test target.
- Request the host's existing UI refresh/navigation/effect mechanism, if
  available, with the accepted resource ID and field IDs. A cursor animation
  reflects work; it is not the mutation itself.
- Refresh page context before a subsequent browser action. Stale element IDs
  must not be reused across navigation or a rerender. Re-inspect ambiguous
  matches rather than clicking the first of two identically named fields.

If no UI synchronization mechanism exists, report “saved via API; page not
verified.” Do not claim an edit is visible because the API returned success.
Opening another resource in the user's browser does not change the task's
target implicitly: re-check resource identity before the next write.

## Reconnect and large-context discipline

- Persist task IDs, operation IDs, snapshot revision, file paths, and unresolved
  work in a concise task manifest. Do not persist secrets there.
- On resume, re-check permissions and current resource state before continuing.
- Search files, inspect relevant ranges, and process large datasets with code.
  Do not stuff the wiki or every transcript into the user message.
- Treat generated scripts as local analysis tools unless deliberately attached
  to an agent. A script in Norm's workspace is not a deployed agent code step.
