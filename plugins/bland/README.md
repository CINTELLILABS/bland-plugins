# Bland (Cursor Plugin)

The official Cursor plugin for [Bland](https://bland.ai) — the voice AI platform for building, running, and analyzing phone-call agents.

Adds Bland's first-party MCP server to Cursor, letting the agent:

- Query call analytics (volume, duration, disposition, tags)
- Inspect individual calls (transcript, recording, timeline)
- Run and inspect eval runs
- Validate and read conversation pathways
- Manage agents and hit the general Bland API

The MCP endpoint is hosted at `https://api.bland.ai/v1/mcp` and is authenticated by API key.

## Install

1. Install this plugin from the Cursor marketplace.
2. Open **Plugins → Configure** and set:
   - **BLAND_API_KEY** — your Bland API key (get one at https://app.bland.ai/settings/api-keys)
   - **BLAND_API_URL** — leave as the default (`https://api.bland.ai`) unless you're pointing at a dev/staging server
3. Reload Cursor. The `bland` MCP server should show connected in the MCP status panel.

## Verify

Ask the Cursor agent something like:

> Use the Bland MCP to show me my last five calls and their outcomes.

The agent will reach for `bland_api_get` on `/v1/calls` (or `get_call_log` for a single call by id), authenticate with your key, and return results scoped to your Bland org.

## Auth

API key is passed as a Bearer token in the `Authorization` header on every request. No OAuth flow is required.

## Support

- Docs: https://docs.bland.ai
- Support: support@bland.ai
- Issues with this plugin: https://github.com/CINTELLILABS/bland-plugins/issues
