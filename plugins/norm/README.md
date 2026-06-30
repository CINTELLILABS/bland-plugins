# Bland Norm Claude Code Plugin

Norm is the Claude Code activation layer for Bland MCP.

The product model is:

```text
Bland API MCP server = capabilities
Norm plugin = Claude Code UX
```

The plugin should not simulate Bland locally or own pathway state. Bland MCP owns capabilities and state; Norm provides `/norm`, `super_norm`, skills, and hooks so Claude uses those capabilities correctly.

## Setup

Three commands, all run inside Claude (Desktop or CLI). No `settings.json` editing, no "Configure options" UI.

```text
/plugin marketplace add CINTELLILABS/bland-plugins
/plugin install norm@bland
/norm:setup YOUR_BLAND_API_KEY
```

`/norm:setup` writes your key (and API URL) to `settings.json` for you, then prints a one-line reload note. After it runs:

```text
/reload-plugins
```

This reconnects the Bland MCP client so it picks up the key. The `/norm:*` commands and bin tools read the key instantly — they work even before the reload.

Verify with either:

```text
/norm:status
```

or ask Claude to call the `get_bland_mcp_setup` Bland MCP tool, which reports auth/session state and the exposed tool surface.

### Why `/norm:setup` instead of the Configure UI

In the **Claude Desktop app**, the plugin's "Configure options" panel does not reliably onboard you:

- it does not prompt for the key at install time,
- its saved values can drop on restart, and
- it rejects any API URL that isn't `https://…` — so you cannot point it at a local server.

`/norm:setup` sidesteps all of that by writing the config to a file directly. Both the MCP client and the plugin's bin tools read from that same location, so one command fully onboards a Desktop user.

### Dev / localhost override

To point Norm at a local server build that exposes `/v1/mcp`:

```text
/norm:setup --dev YOUR_BLAND_API_KEY
```

`--dev` sets `bland_api_url` to `http://localhost:3000`. The `/norm:*` commands, bin tools, and the `/v1/*` REST passthrough all honor this over loopback, so Norm works against localhost.

The one exception is the **live native MCP connection**: Claude's HTTP-MCP transport hard-requires `https`, so it won't establish a socket to `http://localhost`. Norm still functions via the loopback/REST path. If you need a live native MCP connection to a dev server, expose it over `https` (e.g. a tunnel) and point at it explicitly:

```text
/norm:setup --url https://your-tunnel.example.com YOUR_BLAND_API_KEY
```

The server accepts both auth header formats:

```text
Authorization: Bearer <BLAND_API_KEY>
Authorization: <BLAND_API_KEY>
```

### Where the key is stored

`/norm:setup` writes to `settings.json` under:

```text
pluginConfigs["norm@bland"].options.bland_api_key
pluginConfigs["norm@bland"].options.bland_api_url
```

(`norm@bland` = plugin `norm` from marketplace `bland`.) This is the single location read by **both** the MCP client (via `${user_config.*}` substitution in `.mcp.json`) and the plugin's bin tools. The setup helper merges into the file — it preserves your other settings — and writes it `0600`.

The key is stored in **plaintext at rest** (mode `0600`). It is not put in the OS keychain, because the bin tools and the `/v1` REST passthrough cannot read the keychain. Rotate the key if the file is ever shared, and never commit `settings.json`.

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

## Expected Tool Flow

For creation:

```text
begin_pathway_generation
create_file / write_file / set_variables / set_model_config / set_node_tools
validate_pathway
create_agent_test_scenario
run_agent_test_scenario
get_agent_test_run
commit_pathway_workspace
```

For edits:

```text
list_pathways / get_pathway
begin_pathway_edit
get_pathway_dependency_context / get_node_execution_context / get_transition_context
edit with file and structured tools
validate_pathway
run_pathway_node_test or Agent-to-Agent Testing
commit_pathway_workspace
```

For simulation:

```text
create_agent_test_scenario
run_agent_test_scenario
get_agent_test_run
```

Do not hand-simulate when Bland test tools are available.

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
