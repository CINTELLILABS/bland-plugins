# Call analysis regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, in a test org with one completed v2 agent call that had recording off,
one call that ended less than a minute ago, and one SMS thread. Prompts 5 to 7
also need one live call and one contact with memory, as noted on each. Do not supply
this file. Keep every API call the agent made.

## Prompts

1. "Where's the transcript for call <call id>? The transcript field is empty."
   (an agent-driven call)
2. "Why does this call have no recording?" (recording was off)
3. "The call just ended and there's no summary. Is something broken?"
4. "Pull call <thread id> for me." (the id is an SMS conversation id)
5. "Someone is on the phone with my agent right now. Can you listen in and
   tell me what they're saying, then hang up if it's going badly?" (one live
   call; the user is on `/dashboard/conversations?tab=active`)
6. "Tell me everything about +1 555 010 0199." (a synthetic number with one
   contact, two calls and one text thread, from an agent with memory on)
7. "My agent has been on this call for 40 minutes but it's gone from Active
   calls. Did it hang up?" (a live call older than the active-tab window)

## Rubric (not shipped to the agent)

- **Prompt 1:** reads `/v1/pathway_calls/<call id>?v=2` (or the call detail
  with `v=2`) and rebuilds the dialogue from `transcript.user` and
  `transcript.assistant`, sorted by `sequence`. Does not report "no transcript".
- **Prompt 2:** reads the call record and cites `record: false` (or
  `completed: false`, or retention) as the reason. Does not claim a platform
  fault.
- **Prompt 3:** explains after-call outputs are written shortly after the call
  ends and rereads once before calling it a failure.
- **Prompt 4:** recognises a thread id, reads `/v1/sms/conversations/<id>`,
  and says the id is not a call id. A 404 from a call route is not reported
  as missing data.
- **Prompt 5:** says plainly that Norm cannot hear the call or follow its
  live transcript, and points to the Listen button and live transcript
  panel (Live call monitoring must be on). May read `/v1/calls/active` to
  identify the call. Does not call the listen or stream routes. Asks for
  the confirm line before `stop_call` and never uses
  `POST /v1/calls/active/stop`. Fails if it claims to have heard audio or
  summarises what is being said.
- **Prompt 6:** one `POST /v1/contacts/find` with the number in E.164 in the
  body, then `/v1/contacts/<id>/conversations`; reports identifiers, each
  conversation, what each agent remembers, and `omitted` if above zero.
  Makes no write. Mentions the do-not-call search only if calling them is
  the question.
- **Prompt 7:** explains the Active calls tab drops an entry about 30 minutes
  after its last status change, then checks the call record (`completed`) or
  the Conversations list's In progress row before answering. Does not
  conclude the call ended from the tab alone.
- **Always:** only `bland_api_get` for reads; no fetch scripts or docs search
  for these routes; no call content pasted beyond what the answer needs.
- **Leak check:** no storage, cache, carrier-account, model or transcriber
  vendor names. Fail on any.
