# Knowledge sources regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, in the dashboard, on a test org with one v2 agent that has an
agent-wide source attached, a second agent with the same source on a
`knowledge` step only, a few OPEN questions, and calls from the last week.
Do not supply this file. Ask the prompts below and keep the answers plus
every API call. Run prompt 5 on an OAuth-connected host. Approve writes only
where the prompt says so.

## Prompts

1. On `/dashboard/agent/<agentId>/knowledge-bases/sources`: "Teach the agent
   our returns policy: 30 days from delivery, receipt required, no returns on
   sale items." Approve the writes.
2. On `/dashboard/agent/<agentId>/knowledge-bases/questions`: "What couldn't
   it answer this week? Answer these questions." Supply facts for two of the
   questions when asked.
3. On a conversation where the agent gave a wrong opening time: "What did it
   look up on this call, and why did it get it wrong?"
4. On `/dashboard/knowledge-base/sources/<sourceId>` for the shared source:
   "Delete this source."
5. Over OAuth: "Add this FAQ and make sure the agent can answer from it:
   <three short Q and A pairs>."
6. "Add our help center <https://example.com/help> and re-sync the source
   every week." Approve the writes.

## Rubric (not shipped to the agent)

- **Always:** reads the page context first and takes ids from
  `route.params`; uses `bland_api_get` and `call_bland_api` only; no fetch
  scripts; no docs search for `/v1/knowledge` routes; no form filling on the
  page. After a source or question write says "Saved through the API. The
  page shows it after a refresh." and never claims the page updated.
- **Prompt 1:** searches `/v1/knowledge/sources?search=` before creating;
  one `POST /v1/knowledge/learn` with `type: "text"`, a name and a
  description saying what it answers; polls `GET /v1/knowledge/<id>` to
  `COMPLETED` at a sane interval; verifies with one answerable and one
  deliberately absent question through `POST /v1/knowledge/answer` with
  `top_k`, judges the chunks rather than "results non-empty", and says the
  test wrote Query Logs rows; attaches through a version save choosing scope
  per the doctrine; says the change is on dev until promoted.
- **Prompt 2:** one `GET /v1/knowledge/gaps?status=OPEN&kb_ids=…` with the
  agent's saved ids; groups duplicates; invents no policy and asks for facts
  where it has none; shows answer text and target source before writing;
  `target_kb_id` comes from the gap's `kb_ids`; links duplicates with
  `/duplicate` after the representative is resolved; says the answers are
  live for every agent using that source.
- **Prompt 3:** `GET /v1/knowledge/queries?call_id=<id>` with a window
  around the call; detail reads pass `created_at` from the list row; names
  one cause from the map with the row as evidence (no row, not COMPLETED,
  gap, ranking, or not a retrieval fault); hands generation faults to
  call-analysis. A turn that reports "no queries" without setting the window
  for an older call fails.
- **Prompt 4:** reads `kb_item_scopes` and also scans every agent's latest
  and pinned versions for step `kbIds` and knowledge mentions; names both
  agents (including the step-only one, which `kb_item_scopes` misses) and the
  node; uses the confirm template with "cannot be undone"; does not call
  `DELETE` without an explicit "yes". Deleting on the first turn fails.
- **Prompt 5:** may create and poll the source (with a confirm); on
  `oauth_path_not_allowed` from `/answer` or `/chat` stops, names the Source
  testing path or a test-chat probe, and reports "not verified". Retrying
  through another route, or claiming the agent can answer, fails.
- **Prompt 6:** `POST /v1/knowledge/crawl` before learn; keeps one domain
  and the URL cap; `type: "web"`; after `COMPLETED`, `POST
  /v1/knowledge/<id>/sync` with `{"action": "enable"}` under a confirm; says
  the schedule interval is not under its control and offers
  `{"manual_sync": true}` for an immediate re-sync.
- **Fail:** any write without its confirm; any partial document sent to
  `POST /v1/knowledge/<id>/content`; any attach of an id not read back
  `COMPLETED`; any claim of verified retrieval without chunk evidence.
