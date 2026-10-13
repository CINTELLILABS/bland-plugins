# Analytics cohorts regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, attached to an agent's Analytics page with real traffic in the last
30 days. Do not supply this file. Ask the prompts below and retain the answers
plus the API calls and local commands the agent ran. This evaluates whether
the skill makes the agent use the cohort contract correctly, not the size of
any one cohort.

## Prompts

1. "Show me the contained calls that ran longer than five minutes."
2. "Which calls in the last week reached the booking step?" (name a node the
   agent has).
3. "How many calls escalated in the last 7 days for this agent? Open them."
4. "Show me the calls where the caller asked for a human."
5. "Inbound calls that were transferred or dropped in the first few seconds,
   but not web calls."
6. "List the calls where the duration was over 3 minutes and the caller hung
   up." (Wording invites the wrong column name.)

## Rubric (not shipped to the agent)

- **Calls:** one offline validate with `scripts/validate-predicate.cjs`, one
  `call_bland_api` POST to `/v2/analytics/cohorts`, `bland_api_get` polls on
  `/v2/analytics/cohorts/<id>` until `ready` or `failed`, and one confirming
  read. No `fetch` scripts. No docs search for the cohort routes. No `/ids`
  read unless the user asked for ids.
- **Polling:** a few seconds apart at first, then about every 15 seconds;
  stops at `ready` or `failed`; no second cohort for the same ask while one
  is building.
- **Report:** states `size` and `truncated` from the read, `visible_size` when
  present (and never reads `null` as zero), and the predicate in plain words.
  Says the Conversations page opens the list itself. Never tells the user to
  reload, and never asks them to paste an id.
- **Prompt 1:** light predicate on `calls`: `outcome = contained` (or
  `outcomes: ["contained"]`) and `call_length > 5` in minutes, not seconds.
- **Prompt 2:** reads the node id before writing the predicate; uses
  `pathway_events.node_id`; says the cohort is heavy and will take longer;
  keeps the window to the week asked.
- **Prompt 3:** `agent_key` from the page, a 7-day window, both escalation
  outcomes (or `metric: "escalation"` with the reason given); reports the
  count from `size`.
- **Prompt 4:** builds no cohort. Names the rule (transcripts are denied
  columns; a cohort filters columns and cannot read what was said), says how
  escalation differs, and hands off to dispositions, with the follow-up
  `disposition` predicate once one exists. No `contains` stand-in.
- **Prompt 5:** one `and` holding `inbound = true`, an `or` of the escalation
  outcomes and `early_exit = true`, and a `not` over `is_web = true`. Light.
- **Prompt 6:** if the first draft names `duration`, the validator or the 400
  names `and[n].col: unknown column: calls.duration`; the agent fixes only
  that node to `call_length` and resends. A turn that rewrites the whole
  predicate or retries the same body fails.
- **Always:** quotes only numbers it read; names the window it used in UTC;
  refuses the unexpressible with the rule and the hand-off (Sankey for
  waypoints, dispositions for what was said, `query_analytics` for
  aggregates).
- **Fail:** any approximation of an unexpressible ask; any claim of a ready
  cohort without a `ready` read; any request with `waypoint`; any customer
  metric route called while `GET /v2/analytics/org/metrics` answers 404; a
  judgment metric POST, or a PUT that changes a judgment metric's `kind`,
  `source`, `denominator` or `spec`, sent before the user said yes to the
  billed 90-day scoring; a `trunc` dimension sent to `query_analytics`.

## Explain-how-it-works cases

Ask with the Analytics page attached. No cohort or metric write is expected.

7. "The tile says 412 connected calls but the cohort you built has 409. Which
   is right?"
8. "I finished a test call five minutes ago. Why isn't it on the Analytics
   page?"
9. "Why is my new booked-rate tile empty?"

Rubric (not shipped to the agent):

- **Prompt 7:** names freshness (processed data trails real time; cohorts are
  snapshots at build time) and population differences; recommends a cohort
  with `metric: "conversations"` on the same window. Does not call either
  number wrong without a read.
- **Prompt 8:** says simulations are never counted, and that a real call
  usually reaches the tiles within about an hour and the Sankey the next UTC
  day; the Conversations list shows it once completed.
- **Prompt 9:** reads `GET …/metrics` or the summary and reports `status`
  `awaiting` and `coverage`; explains the automatic 90-day backfill and, for a
  judgment metric, that results wait on the disposition. Says "no number yet",
  never zero.
## Overview page cases

Ask with the Overview attached. No write is expected.

10. On `/dashboard`: "The Overview says 1,204 connected calls but Analytics
    says 3,870. Which is right?"
11. On `/dashboard/agent/<id>` (opens `…/analytics/analytics`): "How is my
    agent doing?"

Rubric (not shipped to the agent):

- **Prompt 10:** names the window difference first (the org Overview globe
  counts the last 30 days; Analytics opens on 90), says the globe's message
  count has no tile, and makes one summary read with `window=30` to compare
  like with like. Mentions that on the same window the two differ by at most
  a few calls (processing lag, later corrections). Does not call either
  number wrong.
- **Prompt 11:** takes the agent from `route.params` and the window from the
  search (90 when absent), makes one agent summary read with `shape=v2`, and
  reports tiles against the prior window, naming the window. Says the agent
  Overview is the Analytics page. No cohort, no `query_analytics`.

- **Leak check:** no storage, query-engine, workflow or vendor names; no
  statement about which roles the server does or does not check. Fail on any.
