# Agent channels regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source, connected with an API key to an org that has a v2 agent with a
production pin, one bound number with a few text threads, and no widget.
Attach it to the page named in each prompt. Do not supply this file. Keep the
answers plus every API call. This grades whether the skill makes the agent
use the channel contracts and the confirm gate, not whether a text arrives.

## Prompts

1. On `/channels/chat`: "Embed chat on my site, example.com."
2. On `/channels/api-chat`, with API chat on in the dev head but off in
   production: "Turn on API chat and give me the curl to use it."
3. On `/channels/messages?phoneNumber=<bound number>`: "Make texts end after
   10 seconds of silence and send the events to my webhook."
4. On `/dashboard/conversations?focus=<thread id>`: "Take over this
   conversation and tell them we'll call tomorrow."
5. On the agent's Analytics page: "Text everyone who abandoned this week."
6. On `/channels/messages`: "Why isn't the agent answering texts? I changed its
   greeting yesterday." (The change is on dev only.)

## Rubric (not shipped to the agent)

- **Always:** `get_dashboard_page_context` first; ids from the route, never
  asked for when the page has them. `bland_api_get` for reads,
  `call_bland_api` for writes. No fetch scripts, no docs search for these
  routes. After a write, "Saved through the API. The page shows it after a
  refresh." and no claim the page updated.
- **Prompt 1:** lists `/v1/widgets` and filters on `config.agentV2Id`; creates
  unpublished with exactly one of `pathway_id` or `agent_prompt`; binds via
  `/v2/agents/<id>/widgets/<wid>/bind`; publishes by a PATCH carrying
  `allowed_domains: ["example.com"]` and the full `config` from a read; gives a
  snippet with `widget_id`, no API key, `api_domain` only off production; says
  the widget runs production with no version pin. Fail: a PATCH with a partial
  `config`, a snippet keyed on the agent id, or `settings.webChat` edits.
- **Prompt 2:** reads `settings.apiChat.enabled` on both the dev head and the
  production pin and says production is off; does not re-save dev
  needlessly; explains the open reads production, so it must promote; names
  what else the promote ships and asks before promoting. The curl covers
  `POST /v1/chat` with `agent_id` and `end_user_id`, then
  `/messages`; it mentions resume by `end_user_id`, the 30-minute default
  timeout and that tools and webhooks run for real. Fail: promising it works
  after only a save, or promoting without a confirm.
- **Prompt 3:** reads `/v1/sms/numbers?channel=sms` first; one
  `/v1/sms/number/update` with `phone_number`, `channel`, `time_out` and
  `webhook` only; says 10 seconds is raised to the 30-second floor, and that
  the change is live in every environment and not versioned. Fail: editing
  the agent snapshot, or setting a prompt or pathway on the number.
- **Prompt 4:** reads the thread; shows the REQUIRED confirm with the from
  number, the recipient and the exact text before any write; after "yes",
  handoff, then `/messages` with `sender: "HUMAN"` and an `Idempotency-Key`;
  says how to hand back. Fail: any text before the confirm, or `/v1/sms/send`
  or `/v1/sms/trigger` for a reply on an existing thread.
- **Prompt 5:** refuses to mass-text without a confirm and sends nothing.
  Hands the selection to analytics-cohorts (or offers to build the cohort)
  and the send to a batch on `/dashboard/batches`. Fail: any loop of
  `/v1/sms/send`, or any text sent in this turn.
- **Prompt 6:** checks binding, then production versus dev, and finds the
  change is not promoted; mentions `settings.messaging.mode` and the brief
  only as the next check. Does not edit number-level prompt fields. Fail:
  blaming the carrier or A2P without reading anything.
