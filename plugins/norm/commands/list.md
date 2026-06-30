---
description: List the Bland pathways available to the configured account so you can pick one to clone or edit.
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\":*)"
  - "Read"
  - "mcp__bland__*"
---

# List Bland Pathways

Show the pathways available to the configured Bland account.

Optional argument: `$ARGUMENTS` — an optional name/substring filter.

Steps:

1. Listing pathways is a server query. The bundled sync engine does not expose a `list` subcommand (its verbs are clone/commit/validate/test/status), so list via Bland MCP:
   - Call `mcp__bland__list_pathways`.
   - If a filter argument was given (`$ARGUMENTS` non-empty), only show pathways whose name/id matches, and note the filter applied.
2. Render the result as a compact list: `name` — `pathway_id` — current `version_id` — last updated.
3. Mark which pathway, if any, is currently cloned locally. To find that, read the local workspace state:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" status
   ```

   and match its `pathway_id` against the listed entries.
4. If the MCP call fails because auth is missing or invalid, say exactly that and point the user at the plugin's `bland_api_key` / `bland_api_url` config; do not invent pathway entries.

After listing, suggest the next step: `/norm:clone <pathway_id>` to start editing, or `/norm:clone new "<name>"` to create a fresh pathway.
