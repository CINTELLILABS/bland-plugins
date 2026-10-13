---
name: agent-channels
description: Use when someone wants to "embed chat on my site" or set up a "web chat widget", use the "chat API" or "turn on API chat", "text my customers", "reply to this thread", "take over this conversation" or hand it back, set up "WhatsApp" or "A2P", or asks "why isn't the agent answering texts" or "which version answers texts", on Channels (Web chat, API chat, Messages) or the Conversations page.
---

# Run an agent on chat and text channels

A web chat widget, API chat and texts on a bound number all run the agent's
**production** version, with no pin: promote to change them. Explain how
or why from [how it works](references/how-it-works.md).
Attaching a number belongs to
[phone-numbers](../phone-numbers/SKILL.md),
reading many threads to [call-analysis](../call-analysis/SKILL.md), choosing
recipients to [analytics-cohorts](../analytics-cohorts/SKILL.md).

## Page context

Call `get_dashboard_page_context` (`mode: "synced"`) first; there is no chip.

- `/dashboard/agent/$agentId/channels/chat[/$widgetId]`: agent id, widget id.
- `/dashboard/agent/$agentId/channels/api-chat`: agent id.
- `/dashboard/agent/$agentId/channels/messages?phoneNumber=`: agent id, number.
- `/dashboard/agent/$agentId/conversations`: agent id.
- `/dashboard/conversations`: org; search `focus` is one conversation id.

Read the page; mutate through the API. After a write say: "Saved through the
API. The page shows it after a refresh."

## Workflow: publish a web chat widget

[Contract](references/web-chat.md). Budget: list, create or read, bind, PATCH.

1. `bland_api_get` `/v1/widgets`; keep `config.agentV2Id` = this agent.
2. Reuse one, or `call_bland_api` POST `/v1/widget` unpublished.
3. POST `/v2/agents/<agent id>/widgets/<widget id>/bind`.
4. Publish: PATCH `/v1/widget/<id>` with non-empty `allowed_domains` and the
   **full** read `config` (it is replaced whole).
5. Give the snippet: `widget_id`, `api_domain` off production, `styles.dimensions`.

## Workflow: turn on API chat

[Contract](references/api-chat.md). Budget: three reads, one save, one promote.

1. Read `settings.apiChat.enabled` on the dev head and the production pin; say
   which differs.
2. If dev is off, set it and save the full snapshot.
3. Promote: the open reads production. Promote ships the whole candidate, so
   name the other changes and confirm.
4. Hand over open, message, end, read; `end_user_id` resume; 30-minute
   default timeout; side effects; threads under `effective_channel = api_chat`.

## Workflow: configure a number's texting

[Contract](references/messaging.md). Budget: two reads, one update.

1. Number: `phoneNumber`, else `/v2/agents/<agent id>/inbound`.
2. `bland_api_get` `/v1/sms/numbers?channel=<channel>`.
3. POST `/v1/sms/number/update` `{phone_number, channel, …}`, changed fields
   only. Live in every environment, not versioned. `time_out` floor 30
   seconds. A BYOT `messaging_service_sid` starts a carrier registration.
4. A v2-bound number ignores number-level prompt and pathway.

WhatsApp needs the org entitlement. A2P: `/v1/messaging/a2p` is canonical,
not the page card.

## Workflow: send, take over, hand back

[Routes](references/messaging.md#send-take-over-hand-back). Budget: one read, one write per confirmed step.

1. `bland_api_get` `/v1/sms/conversations/<id>`.
2. Take over (`…/handoff`), reply (`…/messages`, `sender: "HUMAN"`,
   `Idempotency-Key`), hand back (`…/resume`) or close (`…/end`).
3. New thread: `/v1/sms/send`. Never `trigger` to a number the user does not own.

## Why isn't it answering

First failure wins ([checklist](references/messaging.md#why-a-channel-is-silent)):

1. Channel on in production? API chat 403 `CHANNEL_DISABLED`; widget domains
   empty or the site's host not listed.
2. Number bound? Thread handed off or ended?
3. `settings.messaging.mode`: `reasoning` (default) runs the brief unless it
   lists `pathwayOnly` steps; `pathway` runs node by node. Texts change only
   after promote.

## Confirm before

Any text to a person (send, reply, trigger, resume with a message, handoff
with `notify_number`), A2P submit, widget unpublish or delete, history delete.
Quote from-number, recipient and exact text:

```text
About to <verb> <object>: <what changes, who is affected, cost or count>.
This <texts +1… | reaches the carrier | takes chat off <site> | cannot be undone>.
Reply "yes" to proceed.
```

## Refusals and limits

- `oauth_path_not_allowed`: say "this connection cannot reach texts, chats or
  widgets; do it on the Channels page" (or Conversations) and stop.
- "Channel priority" is display-only; nothing reads it.
- Many recipients: a cohort, then `/dashboard/batches`. Never loop sends.

## Do not

- Write fetch scripts, search the docs for these routes, guess fields, or drive the page's forms.
- Edit a widget's `agent_id` or `settings.webChat`; neither configures chat.
