---
name: phone-numbers
description: Use when someone asks "who answers this number", wants to "put my agent on a number" or "point +1… at" an agent, "buy a number", "block this caller", a "fallback number" or transfer on a number, a "SIP trunk", or asks "why is my number not answering", on the Phone numbers page, the SIP pages, or an agent's Calls channel. Also DNC, and hand-offs for release, port-in and Twilio import.
---

# Phone numbers

A number answers through one owner: a v2 agent, a classic persona, or a v1
pathway. With none, it answers nothing. Versions and pins:
[v2-lifecycle](../v2-lifecycle/SKILL.md). Call evidence:
[call-analysis](../call-analysis/SKILL.md).

Routes, bodies and messages are in [endpoints](references/endpoints.md). Do
not write fetch scripts and do not search the docs for these routes.

## Page context

1. Call `get_dashboard_page_context` (`mode: "synced"`). No target chip
   exists; do not wait for one.
2. `/dashboard/phone-numbers`: inventory. `/dashboard/sip`: `route.search`
   `phone_number`, `trunk`, `direction`. `/dashboard/sip-trunks[/$trunkId]`:
   trunk id, `tab`. `/dashboard/agent/$agentId/channels/calls` and
   `/dashboard/agent/$agentId/phone-numbers`: agent id.
3. Mutate through the API, never the page's forms. After every write say:
   "Saved through the API. The page shows it after a refresh."

## Workflow: who answers a number

Budget: two reads.

1. `bland_api_get` `/v1/personas`. The persona whose `inbound_numbers` holds
   the number owns it: a `v2-agent:<agent id>` tag means a v2 agent, any
   other persona is a classic persona.
2. Else `bland_api_get` `/v1/inbound/<number>`: a `pathway_id` means a v1
   pathway; none means unassigned. A 404 means not on the account or a
   lapsed subscription.

"Not answering": add block rules and, for SIP, the
[diagnosis](references/sip.md#diagnose).

## Workflow: put an agent on a number

Budget: two reads, one attach, one read-back, one test call.

1. Run the owner check for every number.
2. A v1 pathway owner: say attaching cuts that live traffic over now. Offer
   the migration rollout ([rollouts](../v2-lifecycle/references/rollouts.md)) instead.
   Any other owner: confirm, naming it.
3. `call_bland_api` POST `/v2/agents/<agentId>/inbound/attach`
   `{"inbound_numbers": ["<number>"], "only_if_unassigned": true}`. Drop the
   flag only after a confirm. Add `"environment": "staging"` only when asked.
4. Read back `/v2/agents/<agentId>/inbound`.
5. Verify: `create_call` to the number, `from` another account number, with
   a short caller `task`. It hits the production pin (staging pin if
   staging-attached).

## Workflow: per-number settings

Budget: read, POST, read-back. Live and unversioned: no publish protects them.

1. `bland_api_get` `/v1/inbound/<number>`. Quote the old value.
2. `call_bland_api` POST `/v1/inbound/<number>` with only the changed keys
   from the 13 in [number config](references/number-config.md#the-safe-keys).
3. Read it back.

## Block and DNC

Inbound callers: `/v1/blocked_numbers`, global or per number. Outbound
suppression: `/v1/org_dnc`; it never blocks inbound.

## SIP

Diagnose with reads per [SIP](references/sip.md).
Signaling is TLS on 5061 only; there is no plaintext 5060 listener. Store
DIDs and extensions as given; never add `+`.

## Confirm before

- Buying, claiming or the Agent Phone Plan: price × count ("3 numbers in 415
  at $15 a month each: $45 a month"). One purchase per number, in sequence;
  re-list before any retry.
- Attaching an owned number; detaching.
- A SIP `test-call` (rings real equipment) or `discover` (probes an outside host).
- A trunk header save (overwrites per-number headers; name the count).
- Deleting a block rule or a DNC entry.

```text
About to <verb> <object>: <what changes, who is affected, cost or count>.
This <reaches the carrier | places N calls | cannot be undone>.
Reply "yes" to proceed.
```

## Hand off, never call

Releasing a number (Settings, Billing), connecting or importing a Twilio
account, port-in, A2P or Branded Caller ID submission.

## Refusals and limits

- `oauth_path_not_allowed`: say "this connection cannot reach
  `<route family>`; do it on `<dashboard path>`" and stop.
- 409 `NUMBER_ALREADY_ASSIGNED`: owned; run the owner check.
- 409 `AGENT_ENV_UNPINNED`: "Staging has no published version. Publish to
  staging first."

## Do not

- Send `prompt`, `pathway_id` or the whole row to `/v1/inbound/<number>`.
- Promise `fallback_number` rings when the agent fails.
- Claim the page updated, guess fields, write fetch scripts or search the docs.
