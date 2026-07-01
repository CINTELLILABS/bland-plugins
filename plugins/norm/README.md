# Bland Norm Claude Code Plugin

Norm is the Claude Code activation layer for Bland MCP.

The product model is:

```text
Bland API MCP server = capabilities
Norm plugin = Claude Code UX
```

The plugin should not simulate Bland locally or own pathway state. Bland MCP owns capabilities and state; Norm provides `/norm`, `super_norm`, skills, and hooks so Claude uses those capabilities correctly.

## Setup

Two commands, run inside Claude Code (or the Desktop app):

```text
/plugin marketplace add CINTELLILABS/bland-plugins
/plugin install norm@bland
```

The interactive install prompts for your **Bland API key** (and optionally the API URL). The key is declared `sensitive` in the plugin manifest, so it is masked at entry and flows ONLY to the Bland MCP connection (`${user_config.bland_api_key}` in `.mcp.json`) — commands, agents, and the offline codec never see it. Restart the session after install so the MCP client connects.

Non-interactive (CI / scripted) install:

```text
claude plugin install norm@bland --config bland_api_key=YOUR_KEY
```

Note: if the plugin is ALREADY installed, `plugin install --config` no-ops — uninstall first, then reinstall with the config.

Verify with `/norm:status`, or ask Claude to call the `get_bland_mcp_setup` tool, which reports auth/session state and the exposed tool surface.

### Dev / tunnel override

To point Norm at a dev server that exposes `/v1/mcp`, set `bland_api_url` at install (or reinstall) time — e.g. `--config bland_api_url=https://your-tunnel.example.com`. Claude's HTTP-MCP transport requires `https`, so expose a local server through a tunnel rather than `http://localhost`.

### Installing via the Claude Desktop app

Installing (Desktop plugin browser or `claude plugin install`) does NOT prompt for config — the installer prints `userConfig options not yet set`. Enter the key in-session with:

```text
/plugin configure norm@bland
```

(masked entry → encrypted in the OS keychain). If the configure panel is unavailable in your Desktop build, the terminal fallback stores the same keychain-backed config:

```bash
claude plugin marketplace add CINTELLILABS/bland-plugins
claude plugin install norm@bland --config bland_api_key=YOUR_KEY
```

Add `--config bland_api_url=https://your-tunnel.example.com` to target a dev server. Restart the Desktop app, then verify with `/norm:status`. **Never paste the key into the chat** — the `--config` flag (or the CLI's interactive prompt) keeps it out of the model context and puts it in the keychain, not a file.

### Rotating or switching your API key

First choice — the built-in config panel, in any Claude Code session:

```text
/plugin configure norm@bland
```

If that panel misbehaves in your build, the manual fallback:

```bash
claude plugin uninstall norm@bland
# delete the stale keychain entry: Keychain Access → search "claude" → delete
claude plugin install norm@bland --config bland_api_key=NEW_KEY
```

Deleting the keychain entry matters: `uninstall` does not always clear it, and a leftover entry is reused on reinstall (so `--config` alone may not take). You can also try the interactive `/plugin` → Installed → norm → configure panel first (CLI only; undocumented on Desktop). `/norm:config` switches the **URL** without any of this — but it cannot change the key, which is keychain-only.

### Switching environments later

`/norm:config` switches the target URL any time — no reinstall:

```text
/norm:config                                   → show the current URL
/norm:config https://your-tunnel.example.com   → point at a dev tunnel
/norm:config --prod                            → back to https://api.bland.ai
```

It edits the non-sensitive `bland_api_url` in `settings.json` → `pluginConfigs`, then you restart the session so the MCP client reconnects. The API key is untouched (keychain). To change the KEY, see "Rotating or switching your API key" above — that's a keychain op, not a settings edit.

The server accepts both auth header formats:

```text
Authorization: Bearer <BLAND_API_KEY>
Authorization: <BLAND_API_KEY>
```

## User Flow

In Claude Code, use:

```text
/norm:norm create a cat fact phone agent, validate it, simulate a conversation, fix issues, and publish it
```

For local development, this repo also installs an optional personal `/norm` command shim so you can type:

```text
/norm create a cat fact phone agent, validate it, simulate a conversation, fix issues, and publish it
```

Marketplace plugin slash commands are namespaced by Claude Code, so the portable plugin command remains `/norm:norm`.

## Expected Flow

Pathway work runs through the `/norm:*` commands. They edit the local `pathway/`
workspace with native file tools and reach the server only through the MCP
passthrough (`mcp__bland__bland_api_get` for reads, `mcp__bland__call_bland_api`
for writes); the bundled `norm-sync.cjs` is an offline, networkless JSON↔files
codec. The old `begin_pathway_*` / `write_file` / `set_*` / `commit_pathway_workspace`
session tools no longer exist on the server — their function lives in the
commands below, backed by the read-only MCP tools `validate_pathway` (the
authoritative compiler), `get_pathway_schema` (structured-surface shapes), and
`get_pathway_context` (deep node/edge semantics).

For creation:

```text
/norm:clone new "<name>"      → call_bland_api POST /v1/convo_pathway/create, then materialize the workspace
edit pathway/ files           → native Read/Write/Edit (prose AND structured YAML)
/norm:validate                → offline structural pre-check
/norm:test                    → Claude-native chat simulation (POST /v1/pathway/chat/create + per-turn POSTs)
/norm:commit                  → rebuild → validate_pathway gate → POST /v1/convo_pathway/create-version|update → optional publish
```

For edits:

```text
/norm:list                    → bland_api_get GET /v1/pathway
/norm:clone <pathway_id>      → bland_api_get GET /v1/pathway/<id> → generate the workspace + baseline
edit pathway/ files           → semantics from the workspace files + get_call_log for runtime evidence
/norm:validate  /norm:test    → offline checks + eval/call runs
/norm:commit                  → working version saved; production unchanged unless you publish
```

For simulation / convergence:

```text
/norm:test [node]             → focused or full check
/norm:loop <id> --goal '...'  → evaluator-optimizer loop until it converges
```

Every state-changing call (`call_bland_api` writes, `create_call`,
`create_eval_run`) is confirmation-gated; read-only `bland_api_get` GETs are not.

## Setup Smoke Test

From this plugin directory:

```bash
BLAND_API_URL=http://localhost:3000 BLAND_API_KEY=org_... node scripts/smoke-mcp.mjs
```

The smoke test initializes MCP, verifies setup/discovery tools, checks core Norm
pathway tools, and confirms high-impact tools such as `create_call` carry explicit
confirmation guidance.

## Desktop / Stdio Adapter

`bin/bland-mcp-desktop` is only a stdio-to-HTTP bridge for clients that cannot connect to HTTP MCP directly. It forwards to `${BLAND_API_URL}/v1/mcp` and does not simulate or locally commit anything.
