---
name: setup
description: "Use when the Bland plugin needs to be connected or is failing to connect — the user asks how to set up, log in, add or rotate a Bland API key, point the plugin at a dev or staging server, or any Bland MCP tool fails with an auth, 401, or 'not signed in' error. Covers where the key is resolved from, how to store it on each host without pasting it into chat, and how to verify the install."
license: MIT
---

# Setting up the Bland plugin

The plugin talks to Bland's hosted MCP server at `<bland_api_url>/v1/mcp` with a Bland API key. Nothing else needs configuring. Your job is to get a key into the one place this host reads it from, verify the connection, and never let the key pass through the chat.

## Where the key is resolved from

The active hosted MCP connection reads credentials from the host that launches it:

- **Claude Code / Claude Desktop:** this plugin's `bland_api_key` and `bland_api_url` config. The sensitive key uses secure storage; the URL is stored in `settings.json`.
- **Cursor:** `BLAND_API_KEY` and optional `BLAND_API_URL` plugin variables, substituted into `mcp.json`.
- **Codex:** `BLAND_API_KEY` in the Codex process's environment, referenced by `bearer_token_env_var` in `.codex-plugin/plugin.json`. The URL is fixed to `https://api.bland.ai/v1/mcp`.

These are separate credential sources, not a fallback chain. The bundled stdio bridge has a legacy resolver for old `norm@*` config and CLI profiles, but no active plugin manifest launches it. The offline pathway codec needs no credentials. Restart the host session after changing its credentials so MCP reconnects.

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

When upgrading from `norm@bland`, configure the key once under `bland@bland`, along with any custom server URL. The active HTTP connection does not read the old plugin's settings or migrate its key.

## Claude Desktop app

Installing from the Desktop plugin browser does not prompt for the key. Enter it with `/plugin configure bland@bland` in a session. If that panel is unavailable in the current build, the terminal command above stores the same keychain-backed config; restart the app afterwards.

## Cursor

Open **Plugins → Configure** for the Bland plugin and set `BLAND_API_KEY` (and `BLAND_API_URL` only for a dev server). Reload the window; the `bland` MCP server should show connected in the MCP status panel.

## Bland CLI (any host)

`bland auth login` (or `bland auth login --device` on a machine without a browser) signs in the CLI. It does not authenticate this plugin's active HTTP connection. Configure the key for your host as described above; sharing a CLI login with the plugin depends on the future hosted MCP mode.

## Codex

Set `BLAND_API_KEY` in the environment that launches Codex. Have the user run this in their own terminal (Bash or Zsh), never through the agent:

```bash
printf 'Bland API key: '
read -rs BLAND_API_KEY
printf '\n'
export BLAND_API_KEY
codex
```

For Codex Desktop, the key must be available to the app process at launch; exporting it in an unrelated terminal after the app starts does not update that process. Restart Codex from an environment containing the key. Codex does not use the Cursor plugin-variable panel or Claude's `/plugin configure` command.

## Pointing at a dev or staging server

On Claude Code / Claude Desktop, change only the URL; the key stays where it is:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"                              # show current URL
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" https://your-tunnel.example  # dev server
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" http://localhost:3000        # local server
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" --prod                       # back to production
```

Remote servers need https. Plain http is accepted only for `localhost` and `127.0.0.1`. Restart the session after a change. On Cursor, set `BLAND_API_URL` in the plugin variables instead. The Codex plugin targets production; `BLAND_API_URL` does not override its URL.

## Rotating the key

Claude Code: `/plugin configure bland@bland` and enter the new key. If a stale keychain entry is reused on reinstall, delete it in Keychain Access (search "claude") before installing again with `--config`. Cursor: update `BLAND_API_KEY` in the plugin variables. Codex: update `BLAND_API_KEY` in its launch environment and restart Codex.

## Verify

On Claude Code, run `/bland:status --check`. On any host, call `get_bland_mcp_setup` and then `bland_api_get { path: "/v1/me" }`. A 401 means the key is missing or wrong on this host; a connection error usually means the URL. Find the tools by their bare names and use the namespace present in the session; hosts prefix plugin tools differently.
