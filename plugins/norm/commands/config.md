---
description: Show or switch the Bland API URL the plugin points at (prod ↔ dev tunnel) without reinstalling. The API key is untouched (OS keychain).
argument-hint: "[https-url | --prod | --clear]"
allowed-tools: ["Bash(node:*)"]
---

# Bland Norm Config

Show or switch `bland_api_url` — the server the Bland MCP connection targets — without uninstall/reinstall. This edits the documented userConfig storage (`~/.claude/settings.json` → `pluginConfigs["norm@bland"].options` — the stable location per the Claude Code plugins reference), which `${user_config.bland_api_url}` in the plugin's `.mcp.json` reads at connect time. The API key is never touched, shown, or moved — it stays in the OS keychain (`sensitive: true`), where it persists across reinstalls. The interactive alternative is `/plugin` → Installed → norm → configure; this command exists because that panel is undocumented on the Desktop app and cannot be scripted.

Steps:

1. Run the config helper and read its JSON stdout, mapping `$ARGUMENTS`:

   - No arguments → show the current URL:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"
     ```

   - An `https://` URL (e.g. a dev tunnel) → point the plugin at it:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" "<url>"
     ```

   - `--prod` → point back at `https://api.bland.ai`. `--clear` → drop the override (plugin default applies).

2. Interpret the JSON result:
   - `ok: true, action: "show"` → report the current URL and that the key is stored separately in the keychain.
   - `ok: true` with `restart_required: true` → report what changed and tell the user to **restart the session** so the MCP client reconnects with the new URL. Config edits do not affect the live connection.
   - `ok: false` → surface `error` plainly. The most common cause: a non-`https` URL — Claude's HTTP-MCP transport requires `https`, so local servers must be exposed through a tunnel.

3. Never echo, request, or look up the API key. If the user wants to change the KEY (not the URL): the key lives in the OS keychain — they can delete the entry in Keychain Access (search "claude") and reinstall the plugin to be re-prompted, or reinstall with `claude plugin install norm@bland --config bland_api_key=NEW_KEY` after uninstalling.
