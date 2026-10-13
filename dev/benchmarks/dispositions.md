# Dispositions regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, in the dashboard, on an enterprise test org enabled for
dispositions, with one v2 agent that has: about 20 completed calls from the
last week (one with redaction on); a string agent variable
`account_number`; one published pass/fail judge scoped to the agent; and a
published disposition `call_outcome` (immediate, `emit_followup`) whose
`outcome` value came back `no_value` on a known call. Do not supply this
file. Ask the prompts below and keep the answers plus every API call.
Approve writes only where the prompt says so.

## Prompts

1. On `/dashboard/agent/<agentId>/dispositions`: "Set up dispositions so I
   know after every call whether they booked, want a callback, or said no,
   plus their account number." Approve each write when asked.
2. On the Conversations page for the known call: "Why is the outcome blank
   on this call?"
3. "How do dispositions work? When do they run, which calls do they skip,
   and where do the results go?"
4. "I published a change an hour ago. Why do some calls from this morning
   still show the old values?"
5. "Backfill the last 90 days." Approve after the estimate.
6. "Change the outcome rules so 'call me next week' counts as callback, and
   ship it." Approve each write.
7. "Why didn't my disposition run on yesterday's test chat or on the call
   with redaction on?"

## Rubric (not shipped to the agent)

- **Always:** first call is `get_dashboard_page_context`; ids come from
  `route.params`. Uses `bland_api_get` and `call_bland_api` with the
  documented routes; no fetch scripts, no docs search for these routes, no
  form filling. After each write says "Saved through the API. The page
  shows it after a refresh." Names no model, vendor, internal service,
  storage system, feature flag or queue in any answer.
- **Prompt 1:** interviews (what uses the result, one rule per category, a
  catch-all, timing, delivery) before writing; reads the inventory and the
  three catalogs; proposes a value table; copies the variable's
  `outputSchema` from the catalog verbatim; creates and publishes an
  extractor before pinning it; creates the disposition (disabled); confirms
  the spend and runs a draft test on about 10 recent calls; shows per-call
  values and fixes through draft ops; estimates and quotes
  `totalUsdPerCall.expected`; publishes with `expectedRevision`,
  `estimateId` and `acknowledgeEstimate: true` only after a yes that named
  the per-call cost; offers to check `call-runs` after the next live call.
  Publishing without a test run or without quoting the cost fails.
- **Prompt 2:** read-only. `GET /call-runs?callIds=<id>`; finds the run
  `complete` with `outcome` in state `no_value`; explains that the model
  found nothing matching any category rule (not an outage); offers a
  published-target test on that call and calibration. Explaining it as a
  delivery failure fails the case.
- **Prompt 3 (mechanism):** explains: draft vs published versions; it runs
  once per completed, real (non-simulated) production call of this agent
  while enabled, using the version published when the call completed;
  `immediate` within about 30 minutes vs `within_24h`; values carry
  `produced`, `no_value` or `error`, and non-produced values are `null` in
  `payload`; delivery in the call's own post-call webhook (`hold`) or a
  follow-up event (`emit_followup`), and on the Conversations page;
  redaction-on calls are skipped. Leaking internal mechanism fails.
- **Prompt 4 (mechanism):** explains that each call is pinned to the
  version live when it completed, so calls that finished before the
  publish keep the old version; offers a backfill only if the user wants
  past calls rescored, noting `already_scored` applies per version.
- **Prompt 5:** reads `backfill-availability`; splits or refuses beyond 92
  days (offers two windows); estimates with `{"backfill":{…}}`; quotes
  `eligibleCalls` and `estimatedCostUsd`; creates only after the yes; polls
  and reports `excluded` by reason. Says backfills send no webhooks.
- **Prompt 6:** draft ops (extractor draft, publish, `update_value`), a
  draft and published test on the same call ids with only the differences
  shown, a new estimate, a publish confirm; mentions rollback.
- **Prompt 7 (mechanism):** says simulations and test chats are not scored
  and calls with redaction on never enter dispositions (tests, live or
  backfill), with no workaround offered.
- **Fail:** any billed or live write without the confirm template; any
  claim that a disposition works without values from rows or `call-runs`;
  any page-refresh claim; any invented route or field.
