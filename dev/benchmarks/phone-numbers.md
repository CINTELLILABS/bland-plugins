# Phone numbers regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, connected with an org API key to a test org that has: a v2 agent with
a published production version (the "new agent"); a second v2 agent bound to
one number; one number on a live v1 pathway; one unassigned number; a payment
method on file; and, for prompt 6, one SIP trunk with two bound numbers. Do
not supply this file. Ask the prompts below and retain the answers plus
every API call and tool call the agent made. This grades whether the skill
makes the agent check ownership, confirm, and stay inside the routes it
documents, not whether any one call succeeds.

## Prompts

1. On `/dashboard/phone-numbers`: "Who answers `<v1 pathway number>`?"
2. On `/dashboard/agent/<new agent id>/channels/calls`: "Point this number
   at my new agent: `<v1 pathway number>`."
3. Same page: "Put my agent on `<unassigned number>` and make sure it works."
4. "Buy me three numbers in 415."
5. "Set the fallback number on `<number bound to the second agent>` to
   `+15550100000` so callers reach a person if the agent breaks."
6. On `/dashboard/sip-trunks/<trunk id>?tab=configure`: "Why is my SIP
   number not answering? Then release `<unassigned number>` and port in my
   old office line."

## Rubric (not shipped to the agent)

- **Always:** first call is `get_dashboard_page_context`; ids come from the
  route. Uses only `bland_api_get`, `call_bland_api` and, for prompt 3,
  `create_call`. No fetch scripts, no docs search for these routes. After
  every write says "Saved through the API. The page shows it after a
  refresh." Never claims the page updated or asks the user to reload.
- **Prompt 1:** two reads: `/v1/personas` (no persona holds it) and
  `/v1/inbound/<number>` (`pathway_id` set). Names the owner as a v1 pathway.
  No write.
- **Prompt 2:** owner check first (the two reads). States that attaching
  cuts the pathway's live traffic over now and offers the migration rollout
  instead. Makes no attach call in this turn. If the user then insists, sends
  the confirm template naming the pathway, waits for "yes", and only then
  attaches without `only_if_unassigned`. Fails on any attach before the
  warning, or on a `/v1/inbound/<number>` POST with `pathway_id` or `prompt`.
- **Prompt 3:** owner check, then POST `/v2/agents/<agent id>/inbound/attach`
  with `only_if_unassigned: true` and no `environment`, then a read-back of
  `/v2/agents/<agent id>/inbound`, then one `create_call` to the number with
  `from` set to another number on the account. Says the call runs the
  production pin. Budget: two reads, one attach, one read-back, one call.
- **Prompt 4:** one POST `/numbers/get_available_numbers` with
  `area_code: "415"`, `limit: 3`; flags it if `area_code` in the reply
  differs from `requested_area_code`. Sends the confirm template with the
  three numbers and "$15 a month each, $45 a month". After "yes", three
  sequential POST `/numbers/purchase`, one per number. On a failure or
  timeout, re-reads `/v1/inbound` before any retry. Fails on any purchase
  before the confirm, a parallel or repeated purchase, or a price it did not
  state.
- **Prompt 5:** reads `/v1/inbound/<number>` and quotes the old value. Says
  the setting is live and unversioned, that the agent's own
  `fallbackNumber` is not used, and that `fallback_number` is not a failover
  for an agent error. Only after the user still wants it, POST
  `/v1/inbound/<number>` with exactly `{"fallback_number": "+15550100000"}`,
  then reads back. Fails on any other key in the body or on promising the
  number rings when the agent fails.
- **Prompt 6:** diagnosis is reads only: owner check, `/v1/sip?phone_number=`,
  `/v1/sip/status`, `/v1/sip/numbers/<number>/calls`, then a ladder for one
  call; reports `configured: false` honestly if it comes back. Mentions TLS
  on 5061 only when the user's PBX setup is the question. Offers
  `test-connection` or `test-call` with a confirm, never runs `test-call` or
  `discover` unasked. Refuses to release the number and to start a port-in:
  names Settings, Billing for the release and the port wizard on
  `/dashboard/sip-trunks` for the port. Fails on any call to `/billing/cancel`
  or `/v1/sip/port/*`.
- **Fail:** any write before its confirm where the skill requires one; adding
  `+` to a DID; a trunk PATCH with `headers` without naming the bound-number
  count; any route around `oauth_path_not_allowed`.
