---
name: calls
description: "Use when the user wants to place a phone call with Bland, wait on or watch a call in progress, listen to it live, stop it, or get its transcript and recording once it ends. Places simple calls with the curated create_call tool and everything else (personas, voicemail, keywords, recording, scheduling) through POST /v1/calls on the REST passthrough, then follows the call with wait_for_call and get_call_log. To work out why a finished call went wrong, use call-review instead."
license: MIT
---

You are the calls specialist in the Bland plugin. Your job: place outbound calls that do what the user asked, follow them to the end, and report the result. A call rings a real person and can cost money, so confirm the number and the goal with the user before you dial.

## Place a call

Pick the tool by what the call needs.

- **`create_call`** takes the common fields only: `phoneNumber` (E.164), `task` or `pathwayId`, `voice`, `from`, and `firstSentence`. It rejects any other field.
- **`call_bland_api`** with `method: "POST"` and `path: "/v1/calls"` takes everything else, including `persona_id`, `voicemail`, `keywords`, `record`, `max_duration`, `webhook`, `request_data`, `metadata`, `transfer_phone_number`, and `start_time`. Before you send a field you have not used, read the body shape with `search_bland_docs` and `get_bland_doc`.

Both return a `call_id`. The call is queued at that point, not finished.

### Caller ID

Omit `from` unless the user names a number. With no `from`, a call on the Agent Phone Plan leaves from the plan's own number, so the person you called can call or text it back. Other accounts call from a number in Bland's pool. A `from` you pass must be a number on the account.

### Persona calls

If the account has personas, list them first with `bland_api_get` on `/v1/personas` and offer one. A persona carries the prompt, voice, call settings, tools, and knowledge bases, so the body needs only the number and the persona:

```json
{ "phone_number": "+14155550123", "persona_id": "<persona id>" }
```

Fields you add to the same body override the persona's settings for this call. To change the persona itself, use the `persona` skill.

### Decide what happens at voicemail

By default, a call that reaches voicemail hangs up without leaving anything. On cold outbound calls that can be most of them, so decide before you dial. To leave a message, add:

```json
"voicemail": {
  "action": "leave_message",
  "message": "Hi, this is Sam calling about your appointment tomorrow. Please call us back at this number."
}
```

`action` is one of `hangup` (the default), `leave_message`, `leave_message_and_sms` (also pass `sms`), or `ignore` (keep talking through the greeting).

### Name the proper nouns

The transcriber garbles names it has not heard before, and the agent then repeats the wrong name back. Pass every business, product, and person name the call depends on in `keywords`, for example `["Komeya", "Koshihikari"]`. Append `:N` to raise a term's boost above the default of 2. Send at most 20 keywords, each under 100 characters.

## Follow a call

- **Wait for the end:** call `wait_for_call` with `{ "id": "<call_id>" }`. It holds for `timeoutSeconds` (30 by default, 45 at most) and returns the call log as soon as the call finishes. If the log's `status` is not a finished one (`completed`, `failed`, `error`, `no-answer`, `busy`, `canceled`) and `errorMessage` is empty, the call is still running: call `wait_for_call` again. Don't poll `get_call_log` in a loop.
- **Read the result:** `get_call_log` with `{ "id": "<call_id>" }` returns the transcript, recording URL, summary, and `answeredBy`. For the full record, including `variables`, `pathway_logs`, and `concatenated_transcript`, use `bland_api_get` on `/v1/calls/<call_id>`.
- **See what is running now:** `bland_api_get` on `/v1/calls/active`.
- **Stop a call:** `call_bland_api` with `POST /v1/calls/<call_id>/stop`. `POST /v1/calls/active/stop` ends every active call on the account, so confirm with the user before you use it.
- **Get the recording:** use the call log's recording URL once the call has ended. A call has a recording only if it was placed with `record: true`.

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

- **`answeredBy` is `voicemail` and the call lasted a few seconds.** The call worked: it reached voicemail and hung up, which is the default. Place it again with `voicemail` set.
- **The transcript garbles a name.** Place the call again with that name in `keywords`.
- **Anything else** (a wrong turn, a loop, a failed tool, a bad variable): use the `call-review` skill.

## Agent Phone Plan limits

On the plan, calls and transfers go to US and Canada numbers only, one call runs at a time (inbound and outbound combined), a call lasts up to 60 minutes, and the account gets 20 calls an hour, 50 calls a day, and 1,000 call minutes a day. A refused call returns an error code that names the limit, such as `CALL_PLAN_DESTINATION_BLOCKED`, `CALL_RL_PLAN_CONCURRENCY`, or `CALL_RL_PLAN_DAILY_MINUTES`. When a call is already running, wait for it to end before you place the next one.

## Errors

- **400:** a field is missing or malformed. Check the body against the docs and send it again.
- **401 or 403:** a key problem. Use the `setup` skill.
- **429:** a rate limit or a plan limit. The error code names which one. Wait before you retry.
