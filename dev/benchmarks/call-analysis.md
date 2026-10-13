# Call analysis regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, in a test org with one completed v2 agent call that had recording off,
one call that ended less than a minute ago, and one SMS thread. Do not supply
this file. Keep every API call the agent made.

## Prompts

1. "Where's the transcript for call <call id>? The transcript field is empty."
   (an agent-driven call)
2. "Why does this call have no recording?" (recording was off)
3. "The call just ended and there's no summary. Is something broken?"
4. "Pull call <thread id> for me." (the id is an SMS conversation id)

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
- **Always:** only `bland_api_get` for reads; no fetch scripts or docs search
  for these routes; no call content pasted beyond what the answer needs.
- **Leak check:** no storage, cache, carrier-account, model or transcriber
  vendor names. Fail on any.
