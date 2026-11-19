---
name: messaging
description: "Use when the user wants a Bland v2 agent to text people: set up texting on a number bound to the agent, send a first text that starts a two-way conversation, read a thread and its replies, take a thread over as a human and hand it back, or check why the agent is not answering texts. Also covers the Agent Phone Plan's text limits. All calls go through the REST passthrough."
license: MIT
---

# Texting with a v2 agent

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

A text reaches a real person, so confirm the from-number, the recipient and the exact text (or goal) with the user before you send.

## How texting works now

Texts run on a number bound to a v2 agent. The agent's production version decides what it says. On a bound number the number's own prompt, objective, pathway and tools are ignored: change the agent, not the number. This plugin does not set `persona_id` or `pathway_id` on texts and does not write a number's texting prompt to drive conversations.

Read and follow [agent channels](../../v2/skills/agent-channels/SKILL.md). The texting contract is in [messaging](../../v2/skills/agent-channels/references/messaging.md): which number, number settings, WhatsApp, A2P registration, reading threads, send, take over and hand back, how a text turn runs, and why a channel is silent. Binding a number to an agent belongs to [phone numbers](../../v2/skills/phone-numbers/SKILL.md).

## Workflow

1. Find the agent's bound number: `bland_api_get` `/v2/agents/<agent id>/inbound`. With no bound number, bind one first.
2. Read the number's texting row: `bland_api_get` `/v1/sms/numbers?channel=sms`. Change only live number settings there (webhook, timeout, request data); they are not versioned.
3. To start a thread, send the first text with `POST /v1/sms/send` from the bound number, as the [send routes](../../v2/skills/agent-channels/references/messaging.md#send-take-over-hand-back) describe. The agent answers every reply.
4. Read the thread with `bland_api_get` `/v1/sms/conversations/<conversation id>`. A `processing` status means accepted for delivery, not delivered.
5. To change what the agent says, change the agent version and promote it. A dev-only edit does not reach texts.

## Agent Phone Plan limits

- Texts go to US and Canada numbers only.
- An account gets 20 texts an hour and 100 a day. The agent's automatic replies count toward both. Past a limit, `/v1/sms/send` returns HTTP 429 with `SMS_RL_PLAN_HOURLY` or `SMS_RL_PLAN_DAILY`, and the agent stops replying until the limit resets. Hourly limits reset on the hour and daily limits at midnight UTC.
- A newly provisioned number can take from minutes to hours before carriers deliver its texts. Texts sent in that window can fail with a registration error and succeed once the number's registration completes.

## Errors

- **400 `MISSING_REQUIRED_FIELDS`:** `user_number` or `agent_number` is missing.
- **404 `INBOUND_NUMBER_NOT_FOUND`:** `agent_number` is not a number on this account.
- **403 `ENTERPRISE_REQUIRED`:** SMS on this account needs an Enterprise plan or the Agent Phone Plan. WhatsApp and iMessage need Enterprise.
- **429:** a text limit. The error code names which one.
