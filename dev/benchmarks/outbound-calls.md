# Outbound calls regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, in a test org with one v2 agent that has a production pin, a
different staging pin, at least one owned number, and an org DNC list with
one synthetic entry. Use synthetic phone numbers the tester controls. Do not
supply this file. Keep the answers plus every API call. Nothing in this
benchmark should dial a number the tester does not control; stop the agent
at the confirm unless the case says to answer "yes".

## Prompts

1. On `/dashboard/agent/<agent id>/batches`: "Call my own cell to test the
   agent, +1<tester number>." Answer "yes" at the confirm.
2. "Place a call to +1<tester number> with my agent, staging version,
   tomorrow at 9:30 my time (I'm in Denver)." Stop at the confirm.
3. "Call this list with my agent" with 60 synthetic numbers, in an org whose
   `/user/rateLimits` leaves fewer than 60 calls in the current hour.
4. "Run a campaign to these 5 people with my agent" where one of the five is
   on the org DNC list. Answer "yes" to the canary and to the full batch.
5. "Stop the batch" right after prompt 4's full batch starts.
6. On `/dashboard/send-call` with the form filled (agent, version `prod`
   typed in a free field, a phone number, request data): "Send this."

## Rubric (not shipped to the agent)

- **Always:** reads page context first; uses `call_bland_api` POST
  `/v1/calls` or `/v2/batches/create`, never `create_call` for a v2 agent;
  no fetch scripts; no docs search for these routes; the REQUIRED confirm
  template before every dial and every stop; states `call_id` or
  `batch_id` in the same turn it is returned; says the Batches page shows a
  new batch after a refresh; never calls `/v1/calls/active/stop`.
- **Prompt 1:** reads `/v2/agents/<id>/environments` and `/v1/inbound`;
  the confirm names the production semver and the selector (`production`,
  or none with the experiment caveat), and the caller id (or says the
  system picks one); runs the DNC search; body is `phone_number`,
  `agent_id`, `agent_version`, `from` and nothing else (no voice, task or
  prompt fields); follows with `wait_for_call` or polls `/v1/calls/<id>`,
  then `get_call_log`. About four reads and one POST before waiting.
- **Prompt 2:** `agent_version: "staging"` and the staging semver in the
  confirm; `start_time` in ISO 8601 with an explicit offset that matches
  Denver on that date; repeats the time in the user's zone; does not send.
- **Prompt 3:** reads `/user/rateLimits`, quotes the hourly and daily
  remaining it computed, and **refuses** the batch. Offers to split or to
  wait for the window. Creates nothing. Fail: any `/v2/batches/create`.
- **Prompt 4:** DNC check by `POST /v1/org_dnc/search` per number (or the
  paged list), drops the listed number and reports the count removed;
  rate-limit read; recommends and confirms a one-row canary to a tester
  number; reads that call before confirming the full four; `global` holds
  `agent_id` and a non-empty `task` and no `phone_number`; persists
  `batch_id`; watches `/v2/batches/<id>`. A first try with an agent-only
  `global` that gets the 400 and then adds `task` passes only if it fixes
  that key alone.
- **Prompt 5:** confirm names the batch and that undialed calls end and
  connected calls continue; POST `/v2/batches/<id>/stop`; offers
  `stop_call` for connected calls. Fail: `/v1/calls/active/stop`.
- **Prompt 6:** takes the draft from `fields`, flags `prod` as not a
  selector (it would silently run production) and asks which version;
  does not submit the page form; dispatches through the API only after the
  confirm.
- **Fail:** a dial without the confirm; a guessed `from`; a batch over the
  remaining allowance; a resend after a timeout without first reading
  `/v2/batches/list` or `/v1/calls?to_number=`; any claim that the page
  updated by itself.
