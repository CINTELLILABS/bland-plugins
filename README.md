# Bland Plugin

Build, test, and run [Bland](https://bland.ai) v2 voice agents from your coding agent or from ChatGPT. Works with **Claude Code**, the **Claude Desktop app**, **Cursor**, **Codex**, **Grok Build**, and **ChatGPT**.

Both plugins in this repo work with **v2 agents only**. They create and change v2 agents and nothing else. They can still read v1 pathways, personas and their calls, to explain them or to migrate them into a v2 agent, but they never create, edit or publish a v1 pathway or persona.

This repo ships two plugins from one marketplace:

- **`bland`** (this README): the general entry point. Calls, texts, analytics, evaluations, call review, debugging, tools, knowledge, automations and triage, with every agent task routed into the v2 doctrine.
- **`norm`** ([v2/README.md](v2/README.md)): the v2 agent workbench. The `/norm:*` commands to build, migrate, validate and simulate agents, the migration builder and audit scripts, and an enforced convergence loop. Its skills are also the basis of the [ChatGPT plugin](#chatgpt).

The `bland` plugin has two layers:

- **The hosted Bland MCP server** at `api.bland.ai/v1/mcp` does the work: reads and writes against your account, agent versions, call logs, analytics, docs search.
- **Skills** teach the agent how to use it well. Each skill routes into the v2 product wiki under [`v2/skills`](v2/skills/api-workspace/references/index.md), which ships inside this plugin.

The plugin prefers the generic MCP proxies when present. If a host exposes only
named endpoint tools, it uses exact typed equivalents from the same connection;
see [tool selection](skills/api/references/tool-selection.md).

## Native function calling

New v2 agents run native function calling: the dialogue model calls the step's tools directly with their arguments. The platform sets `settings.nativeToolCalling` on the first saved version of an agent created with `create_agent` or `POST /v2/agents`, and later saves inherit it. Agents created by the migration routes keep the legacy protocol. The skills check the marker on the running version before they write prompts or tools; see [native function calling](v2/skills/v2-runtime/references/native-function-calling.md).

## Install

Every host except ChatGPT needs a Bland API key from [app.bland.ai/settings/api-keys](https://app.bland.ai/settings/api-keys). Never paste it into the chat; configure it for your host as described below. ChatGPT signs in with OAuth instead.

### ChatGPT

Install **Bland** from the [ChatGPT plugin directory](https://chatgpt.com/plugins/plugin_asdk_app_6abff96d4dac81919dfa3bdbf88d494e), then connect through Bland's sign-in page and choose your organization. No API key or local setup is needed. An organization owner or admin may need to approve the connection.

The ChatGPT plugin packages its own skill set from [`dev/chatgpt/skills`](dev/chatgpt/README.md): setup, v2 agents, calls, aggregate analytics, evaluations, docs, and read-only validation of a supplied legacy pathway graph. How it differs from the coding-agent hosts:

- It calls only the named Bland MCP tools your connection exposes. There is no generic REST passthrough.
- It never buys credits, subscriptions, phone plans, or numbers. Calls, tests, and evaluations can use existing credits.
- No hooks, slash commands or local scripts are installed, so there is no migration builder or enforced convergence loop.
- It reads supplied legacy pathway graphs for validation only; it never edits them.

### Claude Code

```text
/plugin marketplace add CINTELLILABS/bland-plugins
/plugin install bland@bland
```

The install prompts for your key. Scripted installs pass it on the command line so it never enters the model context:

```bash
claude plugin install bland@bland --config bland_api_key=YOUR_KEY
```

Restart the session, then run `/bland:status`.

### Claude Desktop app

Install as above, then enter the key with `/plugin configure bland@bland` in a session. Restart the app.

### Cursor

Install from the [Cursor marketplace](https://cursor.com/marketplace), or add this repo as a plugin. Open **Plugins → Configure** and set `BLAND_API_KEY`. Reload the window; the `bland` MCP server shows connected in the MCP status panel.

### Codex

```text
codex plugin marketplace add CINTELLILABS/bland-plugins
```

Then install via `/plugins`. Set `BLAND_API_KEY` in the environment that launches Codex. In your own terminal (Bash or Zsh), enter it without echoing it or putting it in shell history:

```bash
printf 'Bland API key: '
read -rs BLAND_API_KEY
printf '\n'
export BLAND_API_KEY
codex
```

Codex reads `.codex-plugin/plugin.json` and `.codex-plugin/mcp.json`, which use the production URL and `bearer_token_env_var`; it does not read Cursor plugin variables, Claude plugin config, or the CLI profile. For Codex Desktop, the key must be in the app process's environment when it starts. The marketplace entry for Codex lives at `.agents/plugins/marketplace.json`. See the [setup skill](skills/setup/SKILL.md) for verification.

Codex loads the skills and the MCP server only. The `/bland:status` command is a Claude Code and Grok Build feature; ask for the same work in plain language and the skills drive it.

### Grok Build

Install from the xAI plugin marketplace, then set `BLAND_API_KEY` in the environment that launches Grok Build (the same `read -rs` pattern as Codex above works):

```text
grok plugin install bland --trust
```

Grok Build reads `.grok-plugin/plugin.json` and `.grok-plugin/mcp.json`, which expand `${BLAND_API_KEY}` and the optional `${BLAND_API_URL}` (defaults to production) from the environment. Commands run unchanged; Grok aliases the Claude tool names and `CLAUDE_PLUGIN_ROOT`.

### The v2 `norm` plugin

For the `/norm:*` commands and the enforced convergence loop, install the `norm` plugin from the same marketplace, alongside `bland` or on its own:

```text
/plugin install norm@bland
/plugin configure norm@bland
```

It adds `/norm:build`, `/norm:migrate`, `/norm:validate`, `/norm:simulate`, and `/norm:analytics`. On Claude Code, a Stop hook keeps a migration going until its audit passes, the new version is saved, and simulations pass. See [v2/README.md](v2/README.md).

### Upgrading from `bland` 2.x

Version 3.0.0 removes the v1 pathway file workspace. The `pathways` and `persona` skills, the `/bland:norm`, `/bland:loop`, `/bland:clone`, `/bland:validate`, `/bland:test` and `/bland:commit` commands, the Norm builder and judge agents, the workspace hooks and the offline pathway codec are gone. Ask for the same work in plain language: the `agents` skill builds and changes v2 agents, and `/norm:migrate` carries a v1 pathway or persona into a v2 agent. `/bland:status` now runs the environment self-test only.

### Upgrading from the pre-2.0 `norm` plugin

Before version 2.0.0, this plugin was called `norm`. Install `bland@bland` and enter your key; credentials do not carry over from the old install. The `norm@bland` name now belongs to the v2 workbench plugin above.

## The flow, start to production

1. **Build it**: ask for a booking agent that collects name, callback number and a time, and confirms it back. The `agents` skill designs the hub and scenarios with you, then saves a v2 agent version.
2. **Give it tools**: ask for a tool that checks real availability in your booking API. It is built, proved with a real run, and attached to the agent version.
3. **Prove it works**: ask for simulations of the booking and its failure paths, pinned to that version. With the `norm` plugin, `/norm:simulate` runs the loop until every scenario passes.
4. **Define what to measure**: ask for a disposition: booked yes or no, the appointment time, the reason if not booked. It is tested on real calls before you trust it.
5. **Score every call**: ask for an evaluation judge for this agent, calibrated on known calls.
6. **Ship it**: publish to staging, run the checks, promote, then put the agent on a number.
7. **Iterate from reality**: a weird number? Ask which calls are behind it, review the call to find the turn it broke, and fix the agent against that call.

House rules: it never invents numbers or verdicts (everything is backed by a query, read-back, or transcript quote). Reads are free; anything that mutates, costs, or dials asks first. Your API key stays in the host's config and never appears in the conversation.

## Commands

| Command | What it does |
|---|---|
| `/bland:status` | Environment self-test: connection, namespace, config, account, calls, v2 agents, analytics, docs. |

The `/norm:*` commands come with the [`norm` plugin](v2/README.md).

## Skills

Skills load automatically when the conversation matches their description. These are the `bland` plugin's skills, loaded by Claude Code, Claude Desktop, Cursor, Codex, and Grok Build. ChatGPT uses the skill set described [above](#chatgpt).

| Skill | Use when |
|---|---|
| [setup](skills/setup/SKILL.md) | Connecting the plugin, adding or rotating a key, pointing at a dev server, fixing auth errors. |
| [agents](skills/agents/SKILL.md) | Building, changing, testing, publishing or inspecting a v2 agent, including requests phrased as a pathway or persona. |
| [calls](skills/calls/SKILL.md) | Placing a call with a v2 agent, waiting on or watching it, live listen, stopping it, getting the transcript and recording. |
| [messaging](skills/messaging/SKILL.md) | Texting with a v2 agent on a bound number, reading threads, taking over and handing back. |
| [analytics](skills/analytics/SKILL.md) | Call metrics, trends, metric tiles, cohorts, the Sankey, dispositions, dashboards. |
| [evals](skills/evals/SKILL.md) | Evaluation judges, calibration, panels, runs and verdicts. |
| [call-review](skills/call-review/SKILL.md) | Reconstruct what happened on a real call and tie the failure to a step, edge, variable, or tool. |
| [debug](skills/debug/SKILL.md) | Systematic root-cause for anything misbehaving: reproduce, isolate, fix, verify. |
| [tools](skills/tools/SKILL.md) | Custom tools, integrations, secrets and connections, proved before they are attached. |
| [knowledge](skills/knowledge/SKILL.md) | Knowledge sources the agent retrieves from mid-call, tested before they are attached. |
| [automations](skills/automations/SKILL.md) | Event-driven triggers and pipelines that place calls or send texts with a v2 agent. |
| [triage](skills/triage/SKILL.md) | File and track issues found in agents, with evidence attached. |
| [api](skills/api/SKILL.md) | Any Bland REST endpoint, docs-first, when nothing else covers it. |

## Requirements

- A Bland account. Every host except ChatGPT also needs an API key.
- Node 18 or newer on the host for the bundled scripts (Claude Code ships with it).

## Updating

```text
/plugin marketplace update bland
/plugin update bland@bland
/reload-plugins
```

ChatGPT updates the plugin automatically when a new version is published to the directory.

## Repository layout

```text
.claude-plugin/   marketplace.json (lists bland and norm) + plugin.json with the MCP config (Claude Code)
.cursor-plugin/   plugin.json (Cursor)
.codex-plugin/    plugin.json + mcp.json (Codex; key from BLAND_API_KEY in the environment)
.agents/plugins/  marketplace.json (Codex marketplace entry)
.grok-plugin/     plugin.json + mcp.json (Grok Build; key from BLAND_API_KEY in the environment)
mcp.json          hosted MCP for Cursor (key from plugin variables)
assets/           icon and logo
skills/           one folder per skill, SKILL.md plus references/
commands/         /bland:status
bin/              config helper and the Claude Desktop stdio bridge
v2/               the norm plugin and the v2 product wiki the skills route into
dev/              benchmarks, smoke scripts, release checklist, ChatGPT package, plans
```

## Security and network access

- **Network endpoints.** Everything goes to the Bland API at `https://api.bland.ai` (or the server you set in `BLAND_API_URL` / `bland_api_url`): the hosted MCP server at `/v1/mcp` and, through its passthrough tools, the documented `/v1/*` REST endpoints. The plugin makes no other network calls and sends no telemetry.
- **Credentials.** One Bland API key, held by the host's plugin config or environment and sent only as a `Bearer` header to that server. It is never printed or written into the conversation. ChatGPT uses no API key: it holds an OAuth token issued by Bland's sign-in for the organization you choose, and only the named tools that connection exposes can run.
- **Local scripts.** Everything under `bin/` and `v2/bin/` is plain, unminified Node with no dependencies. `bin/norm-config.cjs` shows or changes the API URL in the host's plugin settings. The `v2/bin/` migration scripts run offline on files in the project directory. `bin/_credentials.cjs` is used only by the Claude Desktop stdio bridge (`bin/bland-mcp-desktop`), which cannot receive plugin config from the app; it reads the Bland key from Claude's own plugin settings, the Bland CLI profile, or the macOS keychain entry for this plugin, and forwards it only to the Bland MCP endpoint. No command or skill calls it.
- **Hooks.** The `bland` plugin installs no hooks. The `norm` plugin's Stop hook gates its migration loop; see [v2/README.md](v2/README.md).

## Support

- Docs: https://docs.bland.ai
- Support: hello@bland.ai
- Issues with this plugin: https://github.com/CINTELLILABS/bland-plugins/issues
