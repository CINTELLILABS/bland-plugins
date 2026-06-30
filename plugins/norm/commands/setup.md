---
description: "One-command Bland Norm onboarding — persist your Bland API key (and optional API URL) to Claude Code settings, then verify with a read-only GET /v1/me. Works inside Claude Desktop with no settings.json editing and no Configure-options UI."
argument-hint: "<BLAND_API_KEY> [--dev | --url <https://host>]   (no args = show current status)"
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\":*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/bland-api.cjs\":*)"
  - "Read"
---

# Bland Norm — Setup

Onboard this account by persisting the Bland API key (and optional base URL) where
BOTH the Bland MCP client and the bundled Norm bin tools read it:
`pluginConfigs["norm@bland"].options` in `~/.claude/settings.json`. This sidesteps
the Claude Desktop quirks where the plugin's config is never prompted for at
install, the "Configure options" panel doesn't persist, and its URL field rejects
anything that isn't `https`. A direct file write has none of those limits.

Arguments (raw):

```text
$ARGUMENTS
```

## Rules (read first)

- **NEVER print, echo, or repeat the API key** — not in confirmations, not in
  summaries, not anywhere. The helper and the API caller are built to never emit
  it; you must not reintroduce it. Refer to it only as "your key".
- Only run the two bundled scripts below. Do not hand-edit `settings.json`.
- The verify step is a **read-only** `GET /v1/me`. Make no other API calls.

## Steps

1. **Parse the arguments.**
   - The API key is the first non-flag token in `$ARGUMENTS`.
   - `--dev` means target local development at `http://localhost:3000`.
   - `--url <value>` means target an explicit base URL (e.g. an `https` tunnel).
   - No `--dev`/`--url` ⇒ keep any existing URL, else default to production
     (`https://api.bland.ai`).
   - **If `$ARGUMENTS` is empty**, skip to step 5 (status-only) — do not prompt
     blindly. If the user clearly intends to set up but gave no key, ask them to
     paste their Bland API key (and mention `--dev` for localhost), then continue.

2. **Persist the config** by running the helper with the parsed values. Pass the
   key via `--key`. Examples (use exactly one URL form):

   ```bash
   # production (default)
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" set --key <KEY>
   # local development
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" set --key <KEY> --dev
   # explicit https host (e.g. a tunnel to localhost)
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" set --key <KEY> --url https://<host>
   ```

   The helper writes `bland_api_url` + `bland_api_key` under
   `pluginConfigs["norm@bland"].options`, sets `enabledPlugins["norm@bland"] = true`,
   merges into the existing file (other settings preserved), and chmods it `0600`.
   Its JSON stdout reports `ok`, `api_url`, `key_written`, and `is_dev` — and never
   the key. If `ok` is false, surface the `error` and stop.

3. **Verify the credentials** with a single read-only call:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/bland-api.cjs" GET /v1/me
   ```

   This resolves the key the helper just wrote (via `_credentials.cjs`) and returns
   `{ ok, status, response }`. The key is never printed.
   - `ok: true` (HTTP 200) ⇒ credentials are valid. If the response identifies the
     org/account, mention that (e.g. the org name/id) as proof — but never the key.
   - `ok: false` with 401/403 ⇒ the key was saved but rejected. Tell the user the
     key looks invalid for this URL and to re-run `/norm:setup <key>` with a valid
     key. (For `--dev`, also note the local server at `http://localhost:3000` must
     be running and reachable.)
   - A network/connection error on `--dev` ⇒ the config is saved correctly; the
     local Bland server just isn't up yet. Say so; don't treat it as a bad key.

4. **Report success** concisely:
   - Config saved to `pluginConfigs["norm@bland"].options` in settings.json, plugin
     enabled, file mode `0600`.
   - The resolved `api_url` (from the helper's output).
   - Whether `GET /v1/me` succeeded (and the org it resolved to, if shown).
   - **Connector + reload note:** the helper ALSO repoints the native MCP connector
     in `.mcp.json` to the chosen URL — it reports `connector_url` and `reload_needed`.
     The bin tools and `/norm:*` commands work immediately, but the live connector only
     re-reads its URL + credentials on reload — when `reload_needed` is true, tell the
     user to run `/reload-plugins` (or restart the desktop app) so the `bland` connector
     picks up the new URL/key. Then suggest verifying with the MCP tool
     `get_bland_mcp_setup`. To switch envs later WITHOUT re-pasting the key, use
     `/norm:config set --url https://<host>` (or `--prod` / `--dev`).
   - **Dev caveat:** if `--dev` (localhost) was used, note that the native HTTP-MCP
     transport requires `https`, so the live MCP connection won't establish against
     `http://localhost:3000`; Norm still works via the bin/REST loopback. For a live
     native MCP connection in dev, expose the server over `https` (a tunnel) and
     re-run with `--url https://<host>`.

5. **Status only** (when no key was provided): run the helper's read-only status and
   report it without changing anything:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs" get
   ```

   Report `api_url`, whether a key is configured (`key_resolved`), and whether the
   plugin is enabled. Never print the key. If no key is configured, tell the user to
   run `/norm:setup <your-bland-api-key>` (add `--dev` for a local server).
