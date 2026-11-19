---
name: automations
description: "Use when the user works with Bland automations, alerts or post-call webhooks: \"when X happens, call or text with my agent\", creating or editing a trigger or pipeline, testing one without dialing, checking why an automation fired or did not, inspecting a failed run, pausing or resuming, resending a webhook delivery, or tracing an automated call back to the run that placed it."
license: MIT
---

# Automations

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

Automations turn events into real calls and texts, so build them precisely, test them without dialing, and diagnose them with evidence. Calls an automation places run a v2 agent. Do not configure a node to dispatch a v1 pathway or a persona.

Read and follow the [automations skill](../../v2/skills/automations/SKILL.md): create inactive, test with the mock step instead of dialing, diagnose runs, and resend deliveries. Routes are in the [automations API](../../v2/skills/automations/references/api.md), the safe testing order is in [testing](../../v2/skills/automations/references/testing.md), and causes are in [how it works](../../v2/skills/automations/references/how-it-works.md).

## Guardrails

- Keep a new trigger inactive until a test passes. Activating a trigger can start real calls at once.
- A live test places real calls or texts: name the agent version and the recipients, and get approval.
- Deleting a pipeline also deletes its triggers and runs. Prefer pausing while you diagnose.
- Quote run ids, statuses and errors verbatim. Never claim an automation works from its status alone.
