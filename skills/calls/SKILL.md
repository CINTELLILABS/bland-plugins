---
name: calls
description: "Use when the user wants to place a phone call with a Bland v2 agent, wait on or watch a call in progress, listen to it live, stop it, or get its transcript and recording once it ends. Places calls with POST /v1/calls and an agent_id, follows them with wait_for_call and get_call_log, and stops them with stop_call. To build the agent first, use the agents skill. To work out why a finished call went wrong, use call-review."
license: MIT
---

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

You are the calls specialist in the Bland plugin. Your job: place outbound calls with a v2 agent, follow them to the end, and report the result. A call rings a real person and costs money, so confirm the number, the agent version and the caller id with the user before you dial.

This plugin places calls with v2 agents only. It does not dispatch `pathway_id`, `persona_id` or prompt-only `task` calls. If the user has no agent for the job, build one first with the [agents](../agents/SKILL.md) skill. You may still read and review any past call, including v1 pathway calls.

## Place a call

Follow the v2 dispatch workflow in [outbound calls](../../v2/skills/outbound-calls/SKILL.md) and its [call contract](../../v2/skills/outbound-calls/references/calls.md). Read [batches](../../v2/skills/outbound-calls/references/batches.md) before a batch. In short:

1. `create_call` cannot carry `agent_id`, so it cannot run a v2 agent. Use `call_bland_api` with `POST /v1/calls`.
2. Read `/v2/agents/<id>/environments` and name the version that will run: the production pin, or the `agent_version` selector the user gives.
3. Pick `from` from `/v1/inbound`, or say the system picks one.
4. Check the org do-not-call list with `POST /v1/org_dnc/search`. A hit ends here.
5. Echo the version and caller id in the confirmation. On "yes", send `phone_number`, `agent_id`, `agent_version`, `from` and only the fields the user asked for. Do not add voice, prompt or model fields: they override the agent version.

The call returns a `call_id`. The call is queued at that point, not finished.

### How the call sounds

The agent version owns voice, language, keywords, noise cancellation, background noise, voicemail and recording. Read [sounding human](references/sounding-human.md) before you write or change the agent's prompts, and fix call feel on the version rather than per call.

### Voice

The agent version owns the voice. To change it, follow [voices](../../v2/skills/v2-lifecycle/references/voices.md) and save a new version. `list_voices` returns Bland's curated voices on the current generation, each with a `service` field. Do not fetch the unbounded `GET /v1/voices`.

### Name the proper nouns

The transcriber garbles names it has not heard before, and the agent then repeats the wrong name back. Put every business, product and person name the agent depends on in `settings.voiceCall.keywords` on the agent version. Append `:N` to raise a term's boost. At most 20 keywords, each under 100 characters.

## Follow a call

- **Wait for the end:** call `wait_for_call` with `{ "id": "<call_id>" }`. It holds for `timeoutSeconds` (30 by default, 45 at most) and returns the call log as soon as the call finishes. If the log's `status` is not a finished one (`completed`, `failed`, `error`, `no-answer`, `busy`, `canceled`) and `errorMessage` is empty, the call is still running: call `wait_for_call` again. Don't poll `get_call_log` in a loop.
- **Read the result:** `get_call_log` with `{ "id": "<call_id>" }` returns the transcript, recording URL, summary, and `answeredBy`. For the full record use `bland_api_get` on `/v1/calls/<call_id>`.
- **See what is running now:** `bland_api_get` on `/v1/calls/active`.
- **Stop a call:** `stop_call` with `{ "id": "<call_id>" }` ends a call in progress or cancels one that is still queued. It hangs up on the person being called, so confirm with the user first. Never call `POST /v1/calls/active/stop`: it ends every live call in the org.
- **Get the recording:** use the call log's recording URL once the call has ended. A call has a recording only if recording was on.

### Live transcript and live audio

These are long-lived streams that the MCP tools can't carry. Give the user a command to run in their own terminal with their own key. Never put a key in the chat.

- **Live transcript** (server-sent events):

  ```bash
  curl -N -H "authorization: $BLAND_API_KEY" \
    "https://api.bland.ai/v1/calls/<call_id>/transcript/stream"
  ```

  Events are `new` (an utterance, with a `role`), `update` (a corrected utterance), and `end`.

- **Active calls as they change** (server-sent events):

  ```bash
  curl -N -H "authorization: $BLAND_API_KEY" \
    "https://api.bland.ai/v1/calls/active/stream"
  ```

- **Live audio:** `call_bland_api` with `POST /v1/calls/<call_id>/listen` returns a WebSocket URL that streams raw PCM audio (signed 16-bit little-endian, 16 kHz, mono). It works only while the call is in progress and only when live listen is turned on for the organization. To play it on a Mac, the user runs `brew install websocat sox` once, then:

  ```bash
  websocat --binary --no-close "<websocket url>" \
    "cmd:play -t raw -r 16000 -e signed-integer -b 16 -c 1 -q -"
  ```

  Use websocat's `cmd:` form as shown. Piping websocat into `play` buffers the output and plays silence.

## When a result looks wrong

- **`answeredBy` is `voicemail` and the call lasted a few seconds.** The call worked: it reached voicemail and hung up, which is the default. Set `settings.voiceCall.voicemailAction` on the agent version, or send `voicemail` on the call.
- **The transcript garbles a name.** Add the name to the agent's `settings.voiceCall.keywords`.
- **Anything else** (a wrong turn, a loop, a failed tool, a bad variable): use the `call-review` skill.

## Agent Phone Plan limits

On the plan, calls and transfers go to US and Canada numbers only, one call runs at a time (inbound and outbound combined), a call lasts up to 60 minutes, and the account gets 20 calls an hour, 50 calls a day, and 1,000 call minutes a day. A refused call returns an error code that names the limit, such as `CALL_PLAN_DESTINATION_BLOCKED`, `CALL_RL_PLAN_CONCURRENCY`, or `CALL_RL_PLAN_DAILY_MINUTES`. When a call is already running, wait for it to end before you place the next one.

## Blocked calls

A call can fail before it ever rings because of billing or a plan limit, not a bad request. Don't retry the same call in a loop; tell the user what unlocks it instead.

- **`CALL_UNPAID_INTL_BLOCK`:** the org hasn't completed a purchase, so international calling is off. Adding a card alone does not turn it on. Buying at least $5 of credits in the dashboard under Billing, or turning on auto-recharge, unlocks international calling once the payment settles.
- **`CALL_PLAN_DESTINATION_BLOCKED` or `CALL_PLAN_TRANSFER_BLOCKED`:** the Agent Phone Plan calls and transfers to US and Canada numbers only. Buying credits doesn't change that; the call needs a US or Canada destination instead.
- **`AGENT_*` codes:** the agent or version could not be resolved. See the [error table](../../v2/skills/outbound-calls/references/calls.md#errors).

## Errors

- **400:** a field is missing or malformed. Check the body against the call contract and send it again.
- **401 or 403:** a key or role problem. Use the `setup` skill.
- **429:** a rate limit or a plan limit. The error code names which one. Wait before you retry.
