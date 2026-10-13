---
name: knowledge-sources
description: Use when someone wants to "teach the agent" something, "add this doc / FAQ / website", says "the agent doesn't know" or asks "what couldn't it answer", wants to "answer these questions", asks "what did it look up on this call", or wants to "re-sync the source" or "delete this source", on the Knowledge pages (Sources, Questions, Query logs, Source testing), org scoped or under an agent's Knowledge tab.
---

# Knowledge sources

A source is an org-wide document, FAQ text or website indexed for
retrieval. An agent uses it only when a saved version lists its id, call-wide
or on a `knowledge` step; follow the scope doctrine in
[resources](../v2-lifecycle/references/resources.md#knowledge-and-memory) and
[knobs](../v2-snapshot/references/knobs.md). Routes and errors:
[API](references/api.md). Tests and causes:
[verification](references/verification.md). Promotion:
[v2-lifecycle](../v2-lifecycle/SKILL.md). Whole calls:
[call-analysis](../call-analysis/SKILL.md).

## Page context

Call `get_dashboard_page_context` (`mode: "synced"`) first. No target chip
exists here.

- `/dashboard/knowledge-base/*`: org scope.
- `/dashboard/agent/$agentId/knowledge-bases/*`: agent id from
  `route.params`. Its attached set may be unsaved; read the latest version.
- `sources/$sourceId` under either: the source id.

Mutate through the API, not the forms. After a source or question
write say: "Saved through the API. The page shows it after a
refresh." A version save refreshes the page itself.

## Workflow: teach the agent

Budget: search, learn, polls, two checks, one version save. Do not write
fetch scripts and do not search the docs for these routes.

1. `bland_api_get` `/v1/knowledge/sources?search=<topic>`. Extend a match;
   never duplicate it.
2. Web: `call_bland_api` POST `/v1/knowledge/crawl` first and agree the URLs
   (one domain). Then POST `/v1/knowledge/learn`, `type` `web` or `text`.
   Name and describe the source by what it answers.
3. Poll `/v1/knowledge/<id>` until `COMPLETED` or `FAILED`. On FAILED show
   `error_message` and stop.
4. Verify one answerable question and one deliberately absent one per
   [verification](references/verification.md).
5. Attach by scope: add the id to `knowledge.kbIds` or a step's `kbIds` and
   save a version. Attach only ids read back `COMPLETED` in this org.
6. Say it is on dev until promoted.

## Workflow: close the loop on open questions

Budget: one list, one write per approved answer.

1. `bland_api_get` `/v1/knowledge/gaps?status=OPEN&kb_ids=<attached ids>&sort_by=occurrences_desc`.
2. Group duplicates. Draft answers from the user's facts only.
3. On approval: POST `/v1/knowledge/gaps/<id>/resolve` `{answer, target_kb_id}`
   with the target from the gap's `kb_ids`; link the rest with
   `/duplicate` `{target_gap_id}`; or `/dismiss`.
4. For a correction: GET `/v1/knowledge/<id>/content`, then POST the whole
   new document.

## Workflow: explain a retrieval miss

Budget: one list, one detail per row.

1. `bland_api_get` `/v1/knowledge/queries?call_id=<id>` with
   `start_date`/`end_date` around the call (default: last 7 days).
2. `/v1/knowledge/queries/<id>?created_at=<row created_at>`: chunks, state.
3. Name one cause from the [cause map](references/verification.md#cause-map):
   not attached, not COMPLETED, chunk absent (a gap), ranking.

## Confirm before

```text
About to <verb> <object>: <what changes, which agents use it>.
This <changes live answers now | cannot be undone>.
Reply "yes" to proceed.
```

- **Delete a source.** First run the [pre-delete scan](references/api.md#pre-delete-scan)
  (`kb_item_scopes`, plus step `kbIds` and mentions in every agent's versions).
  Name every agent and node.
- **Content writes and question answers** (`content`, `resolve`, answer
  edits, `duplicate`, `sync`): live for every agent using the source, no dev
  and production split. Show the diff or answer text.
- **Reindex, re-sync, `replace_urls`, version restore**: same live effect.

## Refusals and limits

- Over OAuth, `/chat` and `/answer` return `oauth_path_not_allowed`. Say
  "this connection cannot run retrieval tests; use Source testing at
  `/dashboard/agent/<agentId>/knowledge-bases/testing`", or run a test-chat
  probe. Never claim verified.
- `POST /answer` with `top_k` is the low-side-effect check. It still logs to
  Query Logs and may add a Questions entry; say so.
- File upload and replace are multipart: dashboard only (Sources, Add source).
- 409 still indexing: poll, then write once.

## Do not

- Send part of a document to POST content; it replaces the whole document.
- Put `{{variable}}` ids anywhere but a step's `kbIds`.
- Write fetch scripts, search the docs for these routes, or guess fields.
