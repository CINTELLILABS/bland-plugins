---
name: v2-lifecycle
description: Use when shipping a Bland v2 agent version to real traffic or asking which version answers ("publish to staging", "promote to production", "roll back", "which version is this call running", "my fix didn't take"), running an A/B test or staged rollout on the Experiments page ("start an experiment", "ramp the new version", "finish the rollout", "pick the winner"), branches, {{env.KEY}} variables, promotion checks, attaching inbound numbers, deleting an agent, or setting an agent's voice and language ("change my agent's voice", "make it speak Spanish").
---

# v2 Agent Lifecycle

> **Server binding:** use only this plugin's MCP server (`plugin_norm_bland`), never the v1 plugin's or a project `bland` server; they may hold another org.

Which version runs where, and how a version reaches callers. The
[lifecycle model](references/lifecycle.md) covers the twin, branches,
variables and checks; read the [endpoint dictionary](references/api.md) before
the first request; objects outside the snapshot are in
[resource boundaries](references/resources.md). Do not write fetch scripts and
do not search the docs for these routes.

## Environments and the ship pipeline

`dev` is the newest save. `staging` and `production` pin one version. No
production pin means calls fail (`AGENT_ENV_UNPINNED`).

```text
save version ──► dev        (automatic)
publish ───────► staging    (mints a semver)
promote ───────► production (empty body = staging's pin, or an exact version_id)
rollback ──────► production (only a version production ran before)
```

Promotion enforces the staging check policy (`409 CHECKS_BLOCKED`); never
add `force: true` to pass it. Promote errors: [API map](references/api.md#lifecycle).

## Which version answers

| Channel | Runs | Override |
|---|---|---|
| Outbound `POST /v1/calls` with `agent_id` | production pin | `agent_version` selector |
| Inbound voice | production pin, or an experiment arm | none |
| Builder test-chat socket | dev head | `version_id` query parameter |
| Web chat widget | the twin, compiled from production | none, no pin |
| API chat (`POST /v1/chat`) | the twin, compiled from production | none |
| SMS | the twin's stored graph | none |

Selectors: `production`, `staging`, `dev`/`latest`, `X.Y.Z`, `branch:<name>`.
The selector, not the version, picks which environment's variables resolve.
A number attach recompiles the twin from the dev head until the next promote.
Test chat proves the dev head, not what customers hear.

## Rollouts (the Experiments page)

Read [rollouts](references/rollouts.md) before the first request. Enterprise
only (`403 ENTERPRISE_REQUIRED`).

- **One live rollout per agent**; creating another returns `409 CONFLICT`.
- `kind: "version"`: production to another version. `kind: "migration"`: a v1
  pathway to this agent.
- Presets `standard`, `cautious`, `fast`, `custom` ramp to 100% and finish
  themselves. `ab` holds one share until a person ends it.
- Statuses: `running`, `paused`, `awaiting_approval`, `tripped` are live;
  `rolled_back` and `finished` are terminal.
- **Every action except reads moves live traffic.** `advance` approves a
  checkpoint; `rollback` returns all calls to the baseline. **`finish` on a
  version rollout promotes the candidate**: get explicit approval.
- For A/B, prefer `POST …/rollouts` preset `ab`. `POST …/experiments` is the
  low-level primitive the page labels "started through the API".
- A live migration rollout blocks promote (`409 ROLLOUT_IN_PROGRESS`).
- After a write: "Saved through the API. The page shows it after a refresh."

## Other lifecycle work

- **Voice and language**: [voices](references/voices.md).
- **Inbound numbers**: attaching clears a v1 pathway on that number, which
  stops answering. Send `only_if_unassigned: true` unless asked to move a
  number ([attach](references/api.md#inbound-numbers-and-identity)); the
  [phone-numbers](../phone-numbers/SKILL.md) skill owns the workflow.
- **Delete agent** unbinds every inbound number; list them first
  (`GET /v2/agents/:agentId/inbound`).
- **Reuse and import**: [workflows](references/resources.md#reuse-and-import-workflows).

## Confirm before

Promote, rollback, rollout or experiment writes, attach, detach, agent
delete, branded caller ID, RCS sender steps, contact-card sends, memory writes:

```text
About to <verb> <object>: <what changes, who is affected, cost or count>.
This <moves live traffic | reaches the carrier | texts +1… | cannot be undone>.
Reply "yes" to proceed.
```
