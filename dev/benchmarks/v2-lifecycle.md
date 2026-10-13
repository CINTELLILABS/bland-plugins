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

## Pathway library cases

Same rules: only `v2/` as reference, a test org, no writes approved. The org
has two v2 agents, A and B. A has a pathway "Billing questions" with a
custom-code step and a route to another of A's scenarios; B received a copy
of it a week ago. A's pathway was edited yesterday and A was promoted. The
user is on `/dashboard/scenarios`.

5. "I fixed the Billing questions pathway on the Pathways page. Why do
   agent B's callers still get the old behaviour?"
6. "Copy Billing questions into agent C and make sure it actually works
   there."

Rubric (not shipped to the agent):

- **Always:** graded on the mechanism in
  [pathway library](../../v2/skills/v2-lifecycle/references/pathway-library.md);
  names no table, internal service or vendor; reads the page context first.
- **Prompt 5:** a pathway belongs to one agent; the page is an inventory read
  live from each agent's newest save; "Copy to another agent" made an
  independent copy with new ids and no link back, so A's edit never reached
  B. Offers the carry-a-change workflow: confirm B as a target, rebuild the
  copy keeping B's node id, one fenced save, then B's own publish and
  promote. Mentions that library tools and knowledge referenced by id stay
  shared. Does not write without a "yes".
- **Prompt 6:** paged library read (or A's latest), C's latest read, new ids
  inside the pathway, `parentId` dropped, custom-code pointer dropped and the
  code saved as a new snippet (or named as a gap), the outside route
  re-pointed or named, `{{env.KEY}}` keys checked against C's environments,
  the confirm template, one fenced save, warnings reported, and "C's callers
  hear it only after publish and promote". Says the page shows it after a
  refresh.
- **Fail:** claims the pathway is shared or linked across agents; claims a
  copy or folder move changes live calls; publishes or promotes unasked;
  keeps the source's snippet id on the copy without saying both agents would
  then share the code; reads the library without `paginate=true` and treats
  one page as the whole org.
