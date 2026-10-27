# Bland Plugin

Build, test, and run [Bland](https://bland.ai) voice agents from your coding agent or from ChatGPT. Works with **Claude Code**, the **Claude Desktop app**, **Cursor**, **Codex**, **Grok Build**, and **ChatGPT**.

This repo ships two plugins from one marketplace:

- **`bland`** (this README): the full Bland surface, with v1 pathways edited as local files.
- **`norm`** ([v2/README.md](v2/README.md)): v2 agents only. Build, migrate, validate, and simulate v2 agents. It is also the basis of the [ChatGPT plugin](#chatgpt).

The `bland` plugin has three layers:

- **The hosted Bland MCP server** at `api.bland.ai/v1/mcp` does the work: reads and writes against your account, the pathway compiler, call logs, analytics, docs search.
- **Skills** teach the agent how to use it well: calls, messaging, pathways, analytics, evals, call review, tools, personas, knowledge bases, automations, triage, debugging, the raw API, and setup.
- **Norm**, the agent builder, plus `/bland:*` commands for the pathway workspace and a self-driving convergence loop that keeps fixing a pathway until a simulated call passes.

Norm prefers the generic MCP proxies when present. If a host exposes only named
endpoint tools, it uses exact typed equivalents from the same connection; see
[tool selection](skills/api/references/tool-selection.md). That endpoint set does
not cover legacy pathway saves/chat, which are reported as blocked rather than
silently replaced with v2 agent operations.

## Install

Every host except ChatGPT needs a Bland API key from [app.bland.ai/settings/api-keys](https://app.bland.ai/settings/api-keys). Never paste it into the chat; configure it for your host as described below. ChatGPT signs in with OAuth instead.

### ChatGPT

Install **Bland** from the [ChatGPT plugin directory](https://chatgpt.com/plugins/plugin_asdk_app_6abff96d4dac81919dfa3bdbf88d494e), then connect through Bland's sign-in page and choose your organization. No API key or local setup is needed. An organization owner or admin may need to approve the connection.

The ChatGPT plugin packages the v2 skills from the `norm` plugin: agent authoring, maintenance, testing and lifecycle, launch, environments, channels, phone numbers, outbound calls, knowledge sources, tools, evaluations, dispositions, analytics, call analysis, automations, triage, and v1-to-v2 migration. It adds ChatGPT-specific skills for setup, docs, aggregate analytics, and validating a supplied pathway graph. How it differs from the coding-agent hosts:

- It calls only the named Bland MCP tools your connection exposes. There is no generic REST passthrough.
- It never buys credits, subscriptions, phone plans, or numbers. Calls, tests, and evaluations can use existing credits.
- No hooks or slash commands are installed. The `/norm:*` procedures are followed as written instructions, so the convergence loop is not enforced automatically.
- The snapshot and migration helper scripts run only where ChatGPT has a workspace with Node.js.
- It does not include the `bland` plugin's v1 pathway file workspace.

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

Then install via `/plugins`. Set `BLAND_API_KEY` in the environment that launches Codex. In your own terminal (Bash or Zsh), enter it without echoing it or putting it in shell history:

```bash
printf 'Bland API key: '
read -rs BLAND_API_KEY
printf '\n'
export BLAND_API_KEY
codex
```

Codex reads `.codex-plugin/plugin.json` and `.codex-plugin/mcp.json`, which use the production URL and `bearer_token_env_var`; it does not read Cursor plugin variables, Claude plugin config, or the CLI profile. For Codex Desktop, the key must be in the app process's environment when it starts. The marketplace entry for Codex lives at `.agents/plugins/marketplace.json`. See the [setup skill](skills/setup/SKILL.md) for verification.

Codex loads the skills and the MCP server only. The `/bland:*` commands and the Norm agent are Claude Code and Grok Build features and are not available in Codex; ask for the same work in plain language and the skills drive it.

### Grok Build

Install from the xAI plugin marketplace, then set `BLAND_API_KEY` in the environment that launches Grok Build (the same `read -rs` pattern as Codex above works):

```text
grok plugin install bland --trust
```

Grok Build reads `.grok-plugin/plugin.json` and `.grok-plugin/mcp.json`, which expand `${BLAND_API_KEY}` and the optional `${BLAND_API_URL}` (defaults to production) from the environment. Hooks, commands, and agents run unchanged; Grok aliases the Claude tool names and `CLAUDE_PLUGIN_ROOT`.

### The v2 `norm` plugin

For v2 agents in a coding agent, install the `norm` plugin from the same marketplace, alongside `bland` or on its own:

```text
/plugin install norm@bland
/plugin configure norm@bland
```

It adds `/norm:build`, `/norm:migrate`, `/norm:validate`, `/norm:simulate`, and `/norm:analytics`. On Claude Code, a Stop hook keeps a migration going until its audit passes, the new version is saved, and simulations pass. See [v2/README.md](v2/README.md).

### Upgrading from the pre-2.0 `norm` plugin

Before version 2.0.0, this plugin was called `norm`, and its pathway commands used `/norm:*`. They now live under `/bland:*`, and the old domain commands became skills. Install `bland@bland` and enter your key; credentials do not carry over from the old install. The `norm@bland` name now belongs to the v2 plugin above. Keep it installed only if you work on v2 agents.

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
| `/bland:validate` | Compile the workspace with the server compiler, after a fast offline structural check. |
| `/bland:test [node]` | Simulated conversation against the pathway, or a focused node check. |
| `/bland:commit` | Rebuild the graph from files, run the server compiler, save a working version, optionally publish. |
| `/bland:status [--server \| --check]` | Workspace state and drift, or a full environment self-test. |

## Skills

Skills load automatically when the conversation matches their description. These are the `bland` plugin's skills, loaded by Claude Code, Claude Desktop, Cursor, Codex, and Grok Build. ChatGPT uses the v2 skill set described [above](#chatgpt).

| Skill | Use when |
|---|---|
| [setup](skills/setup/SKILL.md) | Connecting the plugin, adding or rotating a key, pointing at a dev server, fixing auth errors. |
| [calls](skills/calls/SKILL.md) | Placing a call, waiting on or watching it, live listen, stopping it, getting the transcript and recording. |
| [messaging](skills/messaging/SKILL.md) | Texting from a Bland number, two-way conversations with a goal, reading threads, the number's texting prompt. |
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

- A Bland account. Every host except ChatGPT also needs an API key.
- Node 18 or newer on the host for the workspace commands and hooks (Claude Code ships with it).

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
commands/         the seven /bland:* commands
agents/           norm (the builder) and norm-judge (the fresh-context grader)
hooks/ bin/       session banner, workspace lint, loop gate, and the offline pathway codec
v2/               the norm plugin for v2 agents, and the source of the ChatGPT plugin's skills
dev/              benchmarks, smoke scripts, release checklist, migration plan, ChatGPT submission notes
```

## Security and network access

- **Network endpoints.** Everything goes to the Bland API at `https://api.bland.ai` (or the server you set in `BLAND_API_URL` / `bland_api_url`): the hosted MCP server at `/v1/mcp` and, through its passthrough tools, the documented `/v1/*` REST endpoints. The plugin makes no other network calls and sends no telemetry.
- **Credentials.** One Bland API key, held by the host's plugin config or environment and sent only as a `Bearer` header to that server. It is never printed or written into the conversation. ChatGPT uses no API key: it holds an OAuth token issued by Bland's sign-in for the organization you choose, and only the named tools that connection exposes can run.
- **Local scripts.** Everything under `bin/` and `hooks/` is plain, unminified Node with no dependencies, runs offline, and touches only the pathway workspace in the project directory. `bin/engine.bundle.cjs` is an unminified esbuild bundle of Bland's server-side pathway codec (generator and exporter), built from the Bland server repo by `dev/scripts/bundle-engine.mjs` so local files round-trip byte-identically with the server; it is pure data transformation with no I/O. `bin/_credentials.cjs` is used only by the Claude Desktop stdio bridge (`bin/bland-mcp-desktop`), which cannot receive plugin config from the app; it reads the Bland key from Claude's own plugin settings, the Bland CLI profile, or the macOS keychain entry for this plugin, and forwards it only to the Bland MCP endpoint. No command, agent, or hook calls it.
- **Hooks.** SessionStart prints workspace status; PreToolUse on `Bash` pre-approves only this plugin's own codec scripts; PostToolUse on `Write|Edit|MultiEdit` lints workspace files; Stop gates the convergence loop and warns on uncommitted workspace changes. None of them run shell commands from tool input.

## Support

- Docs: https://docs.bland.ai
- Support: hello@bland.ai
- Issues with this plugin: https://github.com/CINTELLILABS/bland-plugins/issues
