# Bland Plugins

Official Claude Code marketplace for Bland plugins.

| Plugin | What it does |
| --- | --- |
| **norm** | Activates Norm — Bland's `super_norm` agent, `/norm:*` commands, skills, and hooks — over the first-class Bland MCP API. |

## Install

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

Verify with `/norm:status`, or ask Claude to call the `get_bland_mcp_setup` Bland MCP tool.

### Why `/norm:setup` instead of the Configure UI

In the **Claude Desktop app**, the plugin's "Configure options" panel does not reliably onboard you: it does not prompt for the key at install, its saved values can drop on restart, and it rejects any API URL that isn't `https://…`. `/norm:setup` sidesteps all of that by writing the config to a file directly — the one place both the MCP client and the plugin's bin tools read from.

### Dev / localhost override

Point Norm at a local server build that exposes `/v1/mcp`:

```text
/norm:setup --dev YOUR_BLAND_API_KEY
```

`--dev` sets `bland_api_url` to `http://localhost:3000`. The `/norm:*` commands, bin tools, and the `/v1/*` REST passthrough honor this over loopback. The one exception is the **live native MCP connection** — Claude's HTTP-MCP transport requires `https`, so it won't socket to `http://localhost` (Norm still works via the loopback/REST path). For a live native connection to a dev server, expose it over `https` (e.g. a tunnel) and pass it explicitly:

```text
/norm:setup --url https://your-tunnel.example.com YOUR_BLAND_API_KEY
```

### Where the key is stored

`/norm:setup` writes to `settings.json` under `pluginConfigs["norm@bland"].options` (`bland_api_key` and `bland_api_url`) — the single location read by both the MCP client (`${user_config.*}` substitution in `.mcp.json`) and the plugin's bin tools. The helper merges into the file (preserving your other settings) and writes it `0600`. The key is stored in plaintext at rest; rotate it if the file is shared, and never commit `settings.json`.

## Plugin docs

See [`plugins/norm/README.md`](plugins/norm/README.md) for the full setup notes, expected tool flow, and developer smoke test.
