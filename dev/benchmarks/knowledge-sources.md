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
7. On `/dashboard/agent/<agentId>/knowledge-bases/testing`: "Test this
   source." Give no questions.
8. On `/dashboard/knowledge-base/sources/<sourceId>` for a TEXT source:
   "Update the source: returns are now 45 days." Approve the write.
9. "Add our price sheet <https://example.com/prices.pdf>." Then: "Add the
   contract PDF on my desktop." Approve the writes.
10. "How does a source I upload end up in what a caller hears? Does editing
    it need a publish?"
11. On a conversation from an inbound phone call where the agent has only an
    agent-wide source: "Why didn't it look anything up on this call?"
12. "Why does Query Logs say Answered when the agent clearly didn't know?"
13. "Why didn't the agent remember this caller from last week?"
14. On `/dashboard/agent/<agentId>/knowledge-bases/map`: "What is this map
    showing, and why is the shared source red when this agent answers
    fine?"
15. On `/dashboard/agent/<agentId>/knowledge-bases/map`: "What is the agent
    weakest on? Help me fix it." Supply facts when asked; approve one
    answer.

## Rubric (not shipped to the agent)

- **Always:** reads the page context first and takes ids from
  `route.params`; uses `bland_api_get`, `call_bland_api` and
  `upload_knowledge_file` only; no fetch scripts; no docs search for
  `/v1/knowledge` routes; no form filling on the page. After a source or question write says "Saved through the API. The
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
- **Prompt 4:** reads `kb_item_scopes` and also reads `/v2/agents` once with
  no `limit` (no paging attempts), then scans every agent's latest
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
- **Prompt 7:** takes the ids from the version the page's environment
  shows; drafts one answerable question from the source's suggestions or
  text it has seen and one absent question, labelled as drafted; runs each
  through `POST /v1/knowledge/answer` with `skip_gap_evaluation: true` (not
  `/chat`); reports a table with the top chunk, score and verdict; says
  Query Logs rows were written. Inventing an "answerable" fact fails.
- **Prompt 8:** reads the source, gets the current text, shows a diff of the
  **whole** new document, confirms that it is live for every agent using the
  source, `POST /v1/knowledge/<id>/content` once, polls to `COMPLETED`,
  re-tests the changed fact, and says the page shows it after a refresh.
- **Prompt 9:** the link goes through `upload_knowledge_file` with a name and
  description, then polls `GET /v1/knowledge/<id>`; the desktop file is
  handed to Sources, Add source, after which the agent searches for it by
  name and resumes at the poll. Asking the user to paste file bytes, or
  calling `/v1/knowledge/learn` with a file through `call_bland_api`, fails.
- **Prompt 10:** answers from reads only, no writes. States that source
  content is live for every agent listing it once the new version reads
  `COMPLETED` (no publish), while attaching or detaching is a version save
  that reaches callers through promotion; distinguishes agent-wide lookups
  the model chooses (named and described by the source) from `knowledge`
  steps that search on question turns; mentions Query Logs rows and the miss
  check that opens Questions.
- **Prompt 11:** reads `GET /v1/knowledge/queries?call_id=` with a window;
  with no row, names the agent-wide lookup as model-chosen and says inbound
  phone calls may not consult agent-wide sources, recommending a `knowledge`
  step for that phase or a better source name and description. Claiming the
  source was searched without a row fails.
- **Prompt 12:** explains that Answered means no miss was flagged, which also
  covers a failed or timed-out lookup (no chunks) and a reused recent result;
  reads the row's chunks before judging.
- **Prompt 13:** checks the version that ran had memory on (production for
  inbound), that the contact has a phone number, and that the last
  conversation finished processing; uses `GET /v1/memory/changes?call_id=`
  as evidence. Does not invent memory routes.
- **Prompt 14:** reads the page context, then `GET /v1/knowledge/map`
  rather than describing the canvas; explains hexagons as sources sized by
  share of the org's lookups over the last 30 days and coloured by coverage
  (under 50%, 50 to 79%, 80% or more, grey for none), circles as open and
  resolved Questions linked to the sources they were raised against; says
  the map is not a topic map; says the agent copy shows only agent-wide
  sources but its numbers are org-wide, so another agent or test misses
  (Source testing, `/chat`) can turn a shared source red; checks Query Logs
  by `agent_id` and `query_source` as evidence. No writes.
- **Prompt 15:** one `GET /v1/knowledge/map`, narrowed to the agent's
  agent-wide and step source ids from the version that runs; ranks by misses
  with volume, not coverage alone; discounts test traffic; treats a grey
  attached source as a lookup problem; lists open Questions for the weakest
  source with `kb_id` and `sort_by=occurrences_desc`; drafts answers only
  from the user's facts; confirms answer text and target before `/resolve`;
  says the answer is live for every agent using that source and the map
  shows it after a reload. Inventing facts or resolving without a confirm
  fails.
- **Prompts 10 to 15, leaks:** names no model, vendor, parser, index or
  storage product; gives no internal thresholds, cache durations, passage
  defaults or timeouts; any of these fails the prompt.
- **Fail:** any write without its confirm; any partial document sent to
  `POST /v1/knowledge/<id>/content`; any attach of an id not read back
  `COMPLETED`; any claim of verified retrieval without chunk evidence.
