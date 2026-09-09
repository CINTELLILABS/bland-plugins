# Bland Plugin

Build, test, and run [Bland](https://bland.ai) voice agents from your coding agent. Works with **Claude Code**, the **Claude Desktop app**, **Cursor**, and **Codex**.

One plugin, three layers:

- **The hosted Bland MCP server** at `api.bland.ai/v1/mcp` does the work: reads and writes against your account, the pathway compiler, call logs, analytics, docs search.
- **Skills** teach the agent how to use it well: pathways, analytics, evals, call review, tools, personas, knowledge bases, automations, triage, debugging, the raw API, and setup.
- **Norm**, the agent builder, plus `/bland:*` commands for the pathway workspace and a self-driving convergence loop that keeps fixing a pathway until a simulated call passes.

## Install

You need a Bland API key from [app.bland.ai/settings/api-keys](https://app.bland.ai/settings/api-keys). Never paste it into the chat; each host has a config panel for it.

### Claude Code

```text
/plugin marketplace add CINTELLILABS/bland-plugins
/plugin install bland@bland
```

The install prompts for your key. Scripted installs pass it on the command line so it never enters the model context:

```bash
claude plugin install bland@bland --config bland_api_key=YOUR_KEY
```

Restart the session, then run `/bland:status --check`.

### Claude Desktop app

Install as above, then enter the key with `/plugin configure bland@bland` in a session. Restart the app.

### Cursor

Install from the [Cursor marketplace](https://cursor.com/marketplace), or add this repo as a plugin. Open **Plugins → Configure** and set `BLAND_API_KEY`. Reload the window; the `bland` MCP server shows connected in the MCP status panel.

### Codex

```text
codex plugin marketplace add CINTELLILABS/bland-plugins
```

Then install via `/plugins`. Codex support is new and not yet field-tested; the skills load and the MCP config is the same one Cursor uses.

### Upgrading from the `norm` plugin

Version 2.0.0 renames the plugin. Run `/plugin uninstall norm@bland` then install `bland@bland`. Your saved key is picked up from the old config for one release, so you do not need to re-enter it. Commands moved from `/norm:*` to `/bland:*`; the domain commands became skills that load on demand (see the table below).

## The flow, start to production

1. **Build it** — `/bland:norm build me a booking flow that collects name, callback number, and a time, confirms it back` → pathway designed, compiled, saved.
2. **Give it tools** — ask for a tool that checks real availability in your booking API → built, test-run against the real endpoint, attached to the node that needs it.
3. **Prove it works** — `/bland:loop <pathway_id> --goal 'caller books an appointment and gets it confirmed back'` → it simulates the customer, grades every outcome with evidence, fixes what fails, and repeats until the whole call passes. This is the step where you walk away.
4. **Define what to measure** — ask for an outcome schema: booked yes/no, appointment time, reason if not booked → verified on real calls before you trust it.
5. **Score every call** — ask for a scorecard for this pathway → judges generated and calibrated, then every production call auto-scores after it ends.
6. **Watch it** — ask for an ops dashboard → live board in the Bland UI: volume, completion, outcomes, score trends.
7. **Iterate from reality** — a weird number? ask which calls are behind it → review the call to find the exact turn it broke → `/bland:loop <pathway_id> --from-call <call_id>` to fix the flow against that real call.

House rules: it never invents numbers or verdicts (everything is backed by a query, read-back, or transcript quote). Reads are free; anything that mutates, costs, or dials asks first. Your API key stays in the host's config and never appears in the conversation.

## Commands

| Command | What it does |
|---|---|
| `/bland:norm <request>` | End-to-end agent builder: create, edit, simulate, fix, and publish a pathway. |
| `/bland:loop <pathway_id> --goal '…' \| --from-call <id> \| --transcript <file>` | Convergence loop: simulate, judge, fix, repeat until every outcome passes. |
| `/bland:clone [pathway_id \| new <name>]` | List pathways, clone one into a local file workspace, or scaffold a new one. |
| `/bland:validate` | Offline structural pre-check of the workspace. |
| `/bland:test [node]` | Simulated conversation against the pathway, or a focused node check. |
| `/bland:commit` | Rebuild the graph from files, run the server compiler, save a working version, optionally publish. |
| `/bland:status [--server \| --check]` | Workspace state and drift, or a full environment self-test. |

## Skills

Skills load automatically when the conversation matches their description. Every host that reads `SKILL.md` gets them.

| Skill | Use when |
|---|---|
| [setup](skills/setup/SKILL.md) | Connecting the plugin, adding or rotating a key, pointing at a dev server, fixing auth errors. |
| [pathways](skills/pathways/SKILL.md) | Authoring a pathway as local files: nodes, edges, conditions, global prompt, structured YAML, golden references. |
| [analytics](skills/analytics/SKILL.md) | Call metrics, trends, citation schemas, structured extraction, dashboards. |
| [evals](skills/evals/SKILL.md) | LLM judges, rubric calibration, scorecards, automatic scoring of production calls. |
| [call-review](skills/call-review/SKILL.md) | Reconstruct what happened on a real call and tie the failure to a node, edge, variable, or tool. |
| [debug](skills/debug/SKILL.md) | Systematic root-cause for anything misbehaving: reproduce, isolate, fix, verify. |
| [tools](skills/tools/SKILL.md) | Custom REST and code tools, secrets by reference, test-run before attaching. |
| [persona](skills/persona/SKILL.md) | Voices, call config, knowledge and tool attachments, draft to production. |
| [knowledge](skills/knowledge/SKILL.md) | Knowledge bases the agent retrieves from and cites mid-call. |
| [automations](skills/automations/SKILL.md) | Event-driven triggers and pipelines that place calls or send messages. |
| [triage](skills/triage/SKILL.md) | File and track issues found in agents, with evidence attached. |
| [api](skills/api/SKILL.md) | Any Bland REST endpoint, docs-first, when nothing else covers it. |

## Requirements

- A Bland account and API key.
- Node 18 or newer on the host for the workspace commands and hooks (Claude Code ships with it).

## Updating

```text
/plugin marketplace update bland
/plugin update bland@bland
/reload-plugins
```

## Repository layout

```text
.claude-plugin/   marketplace.json + plugin.json (Claude Code)
.cursor-plugin/   plugin.json (Cursor)
.codex-plugin/    plugin.json (Codex)
.mcp.json         hosted MCP for Claude Code (key from plugin config)
mcp.json          hosted MCP for Cursor and Codex (key from plugin variables)
skills/           one folder per skill, SKILL.md plus references/
commands/         the seven /bland:* commands
agents/           norm (the builder) and norm-judge (the fresh-context grader)
hooks/ bin/       session banner, workspace lint, loop gate, and the offline pathway codec
dev/              benchmarks, smoke scripts, release checklist, migration plan
```

## Support

- Docs: https://docs.bland.ai
- Support: support@bland.ai
- Issues with this plugin: https://github.com/CINTELLILABS/bland-plugins/issues
