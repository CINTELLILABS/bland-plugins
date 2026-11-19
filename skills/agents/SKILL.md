---
name: agents
description: "Use when the user wants to build, create, edit, fix, test, simulate, publish, promote or inspect a Bland agent, including any request for a new pathway, persona, call flow, node, prompt, phone agent or voice agent. Every agent this plugin creates or changes is a v2 agent; v1 pathways and personas are read-only. Routes into the v2 authoring, maintenance, snapshot, runtime, testing, lifecycle and launch references, and checks native function calling before prompts or tools are written."
license: MIT
---

# Bland agents (v2 only)

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization. Before the first write, call `list_agents` and confirm the organization with the user.

## The rule

- **Create and change only v2 agents.** A request for a new pathway, persona, node graph or "flow" gets the v2 agent that does the same job. Say so in one sentence, then build it.
- **v1 is read-only.** You may read v1 pathways (`GET /v1/pathway/<id>`, its versions), personas (`GET /v1/personas`) and the calls they handled, to explain them or as a migration source. Never create, update, save, publish or delete a v1 pathway or persona: no `/v1/convo_pathway/*` writes, no `POST /v1/pathway/*` saves, no persona writes.
- **Moving off v1** is a migration into a new v2 agent. The v1 source keeps serving traffic until a human moves the number.

## Where each task lives

The v2 doctrine ships in this repository under `v2/skills`. Read the entry that matches the task, then only the references it names.

| Task | Read |
|---|---|
| Build a new agent: scenario design, hub, steps, tools, conduct rules | [v2 authoring](../../v2/skills/v2-authoring/SKILL.md) |
| Change, repair or debug an existing agent without losing other work | [v2 maintenance](../../v2/skills/v2-maintenance/SKILL.md) |
| Snapshot JSON: nodes, steps, edges, tools, settings | [v2 snapshot](../../v2/skills/v2-snapshot/SKILL.md), [field dictionary](../../v2/skills/v2-snapshot/references/knobs.md) |
| Why a call routed, looped or misused a tool; which version answered | [v2 runtime](../../v2/skills/v2-runtime/SKILL.md) |
| Native function calling: is it on, what to write differently | [native function calling](../../v2/skills/v2-runtime/references/native-function-calling.md), [prompt and tool rules](../../v2/skills/v2-migration/references/native-tool-calling-v1.md) |
| Test chats, simulations, voice tests | [v2 testing](../../v2/skills/v2-testing/SKILL.md) |
| Publish, promote, roll back, rollouts, voice and language | [v2 lifecycle](../../v2/skills/v2-lifecycle/SKILL.md) |
| Environment variables, promotion checks, branches | [agent environments](../../v2/skills/agent-environments/SKILL.md) |
| Take an agent from built to live, in order | [agent launch](../../v2/skills/agent-launch/SKILL.md) |
| Put an agent on a phone number | [phone numbers](../../v2/skills/phone-numbers/SKILL.md) |
| Web chat, API chat, texting | [agent channels](../../v2/skills/agent-channels/SKILL.md) |
| Carry a v1 pathway or persona into a v2 agent | [v2 migration](../../v2/skills/v2-migration/SKILL.md) |

## Native function calling

New agents run native function calling. An agent created with `create_agent` or `POST /v2/agents` gets `settings.nativeToolCalling: true` on its first saved version, and later saves inherit it. The platform owns the marker: a save drops any value you send. Before you write a prompt or a tool for an existing agent, read the marker on the version that takes the traffic and follow the protocol it runs. The [reference](../../v2/skills/v2-runtime/references/native-function-calling.md) explains who is enrolled, the organization-level override, and which steps keep the legacy protocol.

## Workflow

1. Identify the organization, the agent (or that it is new), the branch or environment, and the outcome the user wants.
2. Read the matching entry above. For a new agent, agree the scenario design with the user before you write JSON.
3. Read the full latest snapshot before an edit. Make the smallest stable-ID patch, validate it, and save with `POST /v2/agents/<id>/versions`, keeping the concurrency fence.
4. Read the version back and quote the changed fields. Test that exact version.
5. Publishing to staging and promoting to production are separate approvals. Saving is not publishing.

## Commands and scripts

The `/norm:*` commands and the enforced convergence loop (a Claude Code Stop hook) ship in the `norm` plugin from the same marketplace (`/plugin install norm@bland`). The migration builder and audit scripts ship in both plugins. When a v2 reference names `${CLAUDE_PLUGIN_ROOT}/bin/norm-<name>.cjs`, run `${CLAUDE_PLUGIN_ROOT}/v2/bin/norm-<name>.cjs` from this plugin; they are plain Node with no network access. Without the norm plugin, follow the command procedures by hand and say which enforced checks did not run.

## Guardrails

- Saves, publishes, promotes, rollbacks, number attaches and deletes need the user's approval, stated with the agent, version and effect. Publish, promote and rollback need the owner, admin or operator role; report a 403 instead of retrying.
- Never ask for or print the API key.
- Never claim a save, publish, test result or production change you did not read back.
