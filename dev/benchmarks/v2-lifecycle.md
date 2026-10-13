# v2 lifecycle regression cases: which version answers, the twin, voices

Run a fresh agent with only the packaged `v2/` directory as its reference
source, on a test org with one v2 agent that has: a production pin whose
snapshot uses a curated English-only voice and `languages: ["en"]`; a dev
head that changed the voice to another voice and `languages` to
`["es", "en"]`; one inbound number attached for production after the dev
head was saved; and a voice pool of two ids, one of which is a draft trained
voice. Do not supply this file. Ask the prompts below and keep the answers
plus every tool call. Approve no writes.

## Prompts

1. "I changed the agent's voice an hour ago. Test chat sounds right but my
   phone calls still use the old voice. Why?"
2. "SMS replies on my number follow the new prompt I saved but never
   published. How is that possible?"
3. "I set the agent to Spanish but it still answers in English. What
   decides the language on a call?"
4. "Explain how the voice for each call is picked. Does the rotation pool
   work in the browser voice test?"

## Rubric (not shipped to the agent)

- **Always:** read-only. Graded on the mechanism in
  [how environments work](../../v2/skills/agent-environments/references/how-it-works.md)
  and [voices](../../v2/skills/v2-lifecycle/references/voices.md#how-voice-and-language-work),
  and on naming no speech engine, model vendor, internal service, cache,
  store or timing constant. Voices are described as the product shows them
  (V1, V2, V3; curated; cloned; draft or live).
- **Prompt 1:** the voice lives in the version; test chat runs the dev head,
  calls run the production pin; publish and promote to ship. Reads the
  environments and both snapshots to show the difference. May add that an
  outbound request's own `voice` overrides the agent's.
- **Prompt 2:** SMS, API chat and the widget run the twin, and a production
  attach compiled the dev head of that moment (with `{{env.KEY}}` left
  unfilled) into it. The next promote or rollback refreshes it from
  production. Publishing does not.
- **Prompt 3:** only `languages[0]` counts; a number's own language beats the
  agent's on inbound; the voice must be on a model that lists the language
  (`GET /v1/models`; English-only voices cannot speak Spanish, and nothing
  warns); the change reaches callers only after promote. Recommends a voice
  whose model lists Spanish, Spanish first, then ship.
- **Prompt 4:** request `voice` wins; else a random usable pool voice (two or
  more usable ids; deleted, inaccessible and draft voices skipped); else
  `settings.voice`; else the platform default. The browser Voice test uses
  only `settings.voice` and ignores the pool; a phone test call applies the
  pool rules. Names the draft voice in the pool as skipped on calls.
- **Fail:** any version save, publish, promote or voice-library write; any
  vendor or engine name; any claim that a save changes live calls; any claim
  that publish refreshes SMS or chat.
