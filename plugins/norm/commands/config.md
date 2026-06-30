---
description: "Switch or inspect which Bland environment Norm targets — point the agents AND the native MCP connector at prod, a per-customer URL, or an https dev tunnel, without re-pasting your API key. Rewrites both settings.json and the connector's .mcp.json."
argument-hint: "set --url <https://host> | --prod | --dev   |   get   |   clear"
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\":*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/bland-api.cjs\":*)"
  - "Read"
---

# Bland Norm — Config / environment switch

Switch which Bland environment Norm targets, or inspect the current config. Unlike
`/norm:setup`, this does NOT need your API key — it keeps the stored key and only
changes the URL (so you can flip between prod, a customer host, and a dev tunnel).

It rewrites BOTH places that matter:
- `pluginConfigs["norm@bland"].options` in `settings.json` — read by the bin/REST
  tools and the `/norm:*` agents.
- `mcpServers.bland.url` in the plugin's `.mcp.json` — the native MCP connector
  (the desktop validates this literally and won't substitute `${user_config.*}`, so
  the only way to repoint the connector is to rewrite the literal).

Request:

```text
$ARGUMENTS
```

## Steps

1. **Parse `$ARGUMENTS`** into one of: `set` (with `--url <U>` | `--prod` | `--dev`),
   `get`/`status`, or `clear`. Never accept or print an API key here — switching keeps
   the existing key. (Use `/norm:setup <key>` to set/replace the key.)

2. **Run the helper:**

   ```bash
   # point at an explicit https host (e.g. a tunnel to your local server)
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" set --url https://<host>
   # production
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" set --prod
   # local dev (agents only — see the http caveat below)
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" set --dev
   # inspect (never prints the key)
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" get
   ```

   The JSON stdout reports `ok`, `api_url`, `connector_url`, and `reload_needed`. If
   `ok` is false, surface `error` and stop. If no key is stored yet, the helper fails
   and asks for `/norm:setup <key>` first — relay that.

3. **Report** the new `api_url` + `connector_url`, and:
   - **When `reload_needed` is true**, tell the user to run `/reload-plugins` (or
     restart the desktop app) so the native `bland` connector picks up the new URL.
   - **http/dev caveat:** the desktop MCP transport requires `https`, so a plain
     `http://localhost:3000` connector will NOT load in the desktop app — only the
     bin/REST loopback (the `/norm:*` agents) will use it. For a live native connector
     against a dev server, put it behind an https tunnel and `set --url https://<host>`.
   - Optionally verify the active URL with a read-only
     `node "${CLAUDE_PLUGIN_ROOT}/bin/bland-api.cjs" GET /v1/me`.

Never print the API key.
