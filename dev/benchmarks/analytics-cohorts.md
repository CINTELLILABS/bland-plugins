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
  metric route called while `GET /v2/analytics/org/metrics` answers 404.
