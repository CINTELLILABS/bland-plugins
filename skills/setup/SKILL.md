---
name: setup
description: "Use when the Bland plugin needs to be connected or is failing to connect — the user asks how to set up, log in, add or rotate a Bland API key, point the plugin at a dev or staging server, or any Bland MCP tool fails with an auth, 401, or 'not signed in' error. Covers where the key is resolved from, how to store it on each host without pasting it into chat, and how to verify the install."
license: MIT
---

# Setting up the Bland plugin

The plugin talks to Bland's hosted MCP server at `<bland_api_url>/v1/mcp` with a Bland API key. Nothing else needs configuring. Your job is to get a key into the one place this host reads it from, verify the connection, and never let the key pass through the chat.

## Where the key is resolved from

Every part of the plugin resolves credentials in this order and uses the first it finds:

1. `BLAND_API_KEY` in the environment (Cursor plugin variables arrive this way).
2. The plugin config on the host — Claude Code stores the sensitive `bland_api_key` option in the OS keychain and the non-sensitive `bland_api_url` in `settings.json`.
3. The Bland CLI profile written by `bland auth login`, at `~/Library/Preferences/bland-cli-nodejs/config.json` on macOS, `~/.config/bland-cli-nodejs/config.json` on Linux, `%APPDATA%\bland-cli-nodejs\Config\config.json` on Windows.

The MCP connection itself reads the plugin config (Claude Code) or the plugin variables (Cursor) at connect time, so a change there needs a session restart or `/reload-plugins`.

## Rules

- **Never ask the user to paste the key into the chat**, and never echo, quote, or log a key you encounter in a file or environment variable. Redact it if you must mention it.
- Get the key from https://app.bland.ai/settings/api-keys. Sign-up is at https://app.bland.ai if they have no account.
- Read-only checks are free; nothing here places a call or writes to the account.

## Claude Code (CLI)

Interactive, in a session:

```text
/plugin configure bland@bland
```

Scripted, from a shell (the value never enters the model context):

```bash
claude plugin install bland@bland --config bland_api_key=YOUR_KEY
```

If the plugin is already installed, `plugin install --config` no-ops; use `/plugin configure bland@bland` instead, or uninstall and reinstall. Then restart the session so the MCP client reconnects.

## Claude Desktop app

Installing from the Desktop plugin browser does not prompt for the key. Enter it with `/plugin configure bland@bland` in a session. If that panel is unavailable in the current build, the terminal command above stores the same keychain-backed config; restart the app afterwards.

## Cursor

Open **Plugins → Configure** for the Bland plugin and set `BLAND_API_KEY` (and `BLAND_API_URL` only for a dev server). Reload the window; the `bland` MCP server should show connected in the MCP status panel.

## Bland CLI (any host)

If the user has the Bland CLI, `bland auth login` (or `bland auth login --device` on a machine without a browser) writes the profile file above. The plugin's bin tools read it directly. The hosted MCP connection still needs the key in the plugin config until the CLI's hosted MCP mode ships.

## Pointing at a dev or staging server

Change only the URL; the key stays where it is:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"                              # show current URL
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" https://your-tunnel.example  # dev server
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" http://localhost:3000        # local server
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" --prod                       # back to production
```

Remote servers need https. Plain http is accepted only for `localhost` and `127.0.0.1`. Restart the session after a change. On Cursor, set `BLAND_API_URL` in the plugin variables instead.

## Rotating the key

Claude Code: `/plugin configure bland@bland` and enter the new key. If a stale keychain entry is reused on reinstall, delete it in Keychain Access (search "claude") before installing again with `--config`. Cursor: update `BLAND_API_KEY` in the plugin variables.

## Verify

Run `/bland:status --check`, or call `get_bland_mcp_setup` and then `bland_api_get { path: "/v1/me" }`. A 401 means the key is missing or wrong on this host; a connection error usually means the URL. Both tool namespaces, `mcp__bland__*` and `mcp__plugin_bland_bland__*`, are normal; use whichever exists in the session.
