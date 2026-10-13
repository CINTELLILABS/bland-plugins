---
name: knowledge-sources
description: Use when someone wants to "teach the agent", "add this doc / FAQ / website / file", says "the agent doesn't know", asks "what couldn't it answer" or "what did it look up on this call", wants to "answer these questions", "test this source", "update the source", "re-sync" or "delete this source", asks how knowledge works, on the Knowledge pages (Sources, Questions, Query logs, Source testing).
---

# Knowledge sources

A source is an org-wide document, FAQ or website indexed for retrieval. An
agent uses it only when a saved version lists its id, agent-wide or on a
`knowledge` step ([knobs](../v2-snapshot/references/knobs.md)). End to end,
and agent memory: [how it works](references/how-it-works.md). Routes and errors:
[API](references/api.md). Tests and causes:
[verification](references/verification.md). Promotion:
[v2-lifecycle](../v2-lifecycle/SKILL.md). Do not write fetch scripts and do
not search the docs for these routes.

## Page context

Call `get_dashboard_page_context` (`mode: "synced"`) first.

- `/dashboard/knowledge-base/*`: org scope; `sources/$sourceId` is the id.
- `/dashboard/agent/$agentId/knowledge-bases/*`: agent id from
  `route.params`. Attached sources may be unsaved; read the latest version.
- `…/testing`: Source testing; the agent page tests the agent-wide sources
  of the environment shown (`route.search.env`, `branch`).

After a source or question write say: "Saved through the API. The page shows
it after a refresh." A version save refreshes the page itself.

## Workflow: teach the agent

Budget: search, one ingest, polls, two checks, one version save.

1. `bland_api_get` `/v1/knowledge/sources?search=<topic>`. Extend a match;
   never duplicate it.
2. Ingest, named and described by what it answers: text, `call_bland_api`
   POST `/v1/knowledge/learn` `type: "text"`; web, POST `/v1/knowledge/crawl`
   (one domain, agree the URLs), then `learn` `type: "web"`; a file at an
   https link, [`upload_knowledge_file`](references/api.md#upload-a-file-by-link).
   A file only on the user's machine: they add it on Sources; then search
   for it.
3. Poll `/v1/knowledge/<id>` until `COMPLETED` or `FAILED`. On FAILED show
   `error_message` and stop.
4. Test: one answerable, one absent question.
5. Attach by scope (`knowledge.kbIds` or a step's `kbIds`) and save a
   version. Attach only ids read back `COMPLETED`. Say it is on dev until
   promoted.

## Workflow: test a source

Budget: one read for the ids, two `/answer` calls per question pair.

1. Ids: the sources attached in the version the page shows, or the one named.
2. Questions: the user's, or drafted pairs per
   [Source testing](references/verification.md#source-testing), one
   answerable and one absent, labelled as drafted.
3. Run, judge the chunks and report per [verification](references/verification.md#verify-after-ingest),
   naming the Query Logs rows written.
4. `oauth_path_not_allowed`: hand the questions to the testing page per the
   [fallback](references/verification.md#over-oauth). Never claim verified.

## Workflow: update a source

Budget: one detail read, one content read, one write, polls, a re-test.

1. `bland_api_get` `/v1/knowledge/<id>`: `type`, `status`, `kb_item_scopes`.
2. Write by type per [update by type](references/api.md#update-by-type):
   text, POST the whole new document after a diff; web, `replace_urls` or
   re-sync; file, reindex or replace; integration, sync.
3. Poll to `COMPLETED`, then re-test one changed fact.

## Workflow: open questions

Budget: one list, one write per approved answer.

1. `bland_api_get` `/v1/knowledge/gaps?status=OPEN&kb_ids=<attached ids>&sort_by=occurrences_desc`.
2. Group duplicates. Draft answers from the user's facts only.
3. On approval: POST `/v1/knowledge/gaps/<id>/resolve` `{answer, target_kb_id}`
   (a target from the gap's `kb_ids`); link the rest with `/duplicate`; or
   `/dismiss`.

## Workflow: explain a retrieval miss

Budget: one list, one detail per row.

1. `bland_api_get` `/v1/knowledge/queries?call_id=<id>` with `start_date` and
   `end_date` around the call.
2. `/v1/knowledge/queries/<id>?created_at=<row created_at>`.
3. Name one cause from the [cause map](references/verification.md#cause-map);
   mechanism: [how it works](references/how-it-works.md#how-it-reaches-a-live-call-or-conversation).

## Confirm before

```text
About to <verb> <object>: <what changes, which agents use it>.
This <changes live answers now | cannot be undone>.
Reply "yes" to proceed.
```

- **Delete a source**, after the [pre-delete scan](references/api.md#pre-delete-scan).
  Name every agent and node.
- **Content, answers, reindex, re-sync, `replace_urls`, restore**: live for
  every agent using the source at once. Show the diff or answer text.

## Refusals and limits

- Never send part of a document to POST content; it replaces the whole one.
- `{{variable}}` ids belong only in a step's `kbIds`.
