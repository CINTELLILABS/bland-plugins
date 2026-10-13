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
7. On `/channels/api-chat`: "Explain how API chat works. Which version answers,
   how long does a conversation stay open, and is it the same as a call?"
8. On `/channels/messages?phoneNumber=<bound number>`: "I saved a new
   greeting and then attached this number. Texts already use the new
   greeting but calls don't. Why?" (The save is on the dev head, not
   promoted; the attach was in production; no widget is bound.)
9. On `/channels/chat/<widget id>`: "Can I pin this widget to version 1.2.0
   and test it on staging first? And why does it reply differently than
   texts do?"
10. On `/configure/identity`: "Set up branded caller ID so people see our
    name when the agent calls. How long until it works?" (The identity is
    `not_submitted`, one bound number, no logo uploaded.)
11. On `/configure/identity?phone=<bound number>`: "We set up the RCS contact
    card two weeks ago, but customers still get plain texts with no logo, and
    some never got our contact card. Why?" (The sender is Online but not
    attached; VCF delivery was turned on last week.)

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
- **Prompt 10:** reads `/v2/agents/<id>/identity` first; says identity is
  not versioned (no save or promote); offers a logo upload on the page
  before applying, since none is on file; builds the submit body with a display name of at most
  30 characters, a call reason of at most 60, a listed category, the
  bound number, `tmobile` and/or `verizon` and `attest: true` only after
  the user confirms accuracy; shows the REQUIRED confirm and sends nothing
  before "yes"; says AT&T is not covered, review runs per carrier and
  number (page estimate about 5 to 7 and 7 to 10 business days), the
  switch should be on, and the status is checked with
  `GET …/identity/bcid`. Names no provider behind the application. Fail:
  submitting before the confirm, a second submit, or editing the snapshot.
- **Prompts 7 to 9 and 11 (explain how / why):** answer from
  `references/how-it-works.md`, reads only, no writes. Graded on the correct
  mechanism and on leaking nothing.
  - Prompt 7: production version with no pin; the on/off switch is read from
    production; 30-minute default idle end counted from the open and the
    agent's last reply, `0` off, 30-second floor; resume by `end_user_id`;
    turns run the text runtime (`settings.messaging.mode`, reasoning by
    default, node by node when the Agent context lists node-only steps)
    while calls walk the graph; tools, webhooks, summary and dispositions run
    for real.
  - Prompt 8: a production number attach compiles the latest save into the
    copy that texts and API chat run, while calls resolve the production pin
    at call start; compares the dev head with the production pin; the fix is
    to promote (or, to keep texts on production, bind a widget or promote
    before attaching). Does not blame the number's own settings.
  - Prompt 9: says no version pin and no staging for widgets; a promote or
    rollback changes what the widget runs; points to test chat for a
    version-pinned probe; explains web chat walks the graph node by node
    while texts use the reasoning runtime by default.
  - Prompt 11: answers from `references/how-it-works.md#identity` with reads
    only: an Online sender sends RCS only once attached to the number's
    messaging (Attach in the wizard, or the next status check), with the
    RCS switch on and an RCS-capable handset; reports the page's status
    label, not a raw value. Explains VCF delivery goes once per person,
    with the first SMS or iMessage reply the agent sends them while the
    switch is on, never on RCS or WhatsApp threads, so people the agent
    has not replied to since last week, or who text over RCS, have not got
    one. Fail: blaming A2P, claiming RCS branding can still be edited, or
    offering to resend cards to everyone without a confirm.
  - Fail on any of: naming a model, a messaging provider or vendor behind
    Bland (the carriers named on the page for branded caller ID are fine), an
    internal service, queue, cache or database; describing how the runtime
    is built rather than what the user sees; claiming a widget or API chat
    can be pinned; claiming a staging publish reaches text channels.
