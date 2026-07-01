---
description: One-time onboarding — enter your Bland API key via a NATIVE OS dialog (never the chat). The only key-entry path that works in the Claude Desktop app.
argument-hint: "[--url <https-url>] [--verify]"
allowed-tools: ["Bash(node:*)"]
---

# Bland Norm setup

Onboard the plugin by storing your Bland API key. The key is collected through a **native OS password dialog** — it never passes through the chat composer, the model context, or the transcript. This is the recommended path in the Claude **Desktop** app, whose plugin manager does not prompt for plugin config.

Steps:

1. Run the setup helper and read its JSON stdout, mapping `$ARGUMENTS`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-setup.cjs" $ARGUMENTS
   ```

   A native dialog appears (macOS `osascript` / Windows PowerShell / Linux `zenity`/`kdialog`); the user types their key from app.bland.ai → API keys. Optional flags: `--url <https-url>` also sets the dev/tunnel URL; `--verify` checks the stored key against the server after saving.

2. **NEVER ask the user to paste their key into the chat, and never accept it as an argument** — the script refuses positional args for exactly this reason. If the user pasted a key in chat, tell them not to (it is now in the transcript; they should rotate it) and run this command so the dialog collects a fresh one.

3. Interpret the JSON result:
   - `ok: true, key_stored: true` → tell the user the key is saved and they must **restart the session** so the Bland MCP client connects. If `--verify` was passed, report `auth_ok` (true = the key authenticates against `/v1/mcp`).
   - `cancelled: true` → the user closed the dialog; say so, do not loop.
   - `error` with `fallbacks` (Linux, no dialog tool) → relay the fallback commands (`--stdin` or the `claude plugin install … --config` line) verbatim.
   - any other `error` → surface it plainly.

4. The key is stored in `~/.claude/settings.json` (mode `0600`) — the documented userConfig location that `${user_config.bland_api_key}` in the plugin's `.mcp.json` reads. To rotate: run `/norm:setup` again. To change only the URL later, use `/norm:config`.
