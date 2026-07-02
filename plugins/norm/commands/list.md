---
description: List the Bland pathways available to the configured account. Use when the user wants to see, list, browse, find, or search their pathways, look up a pathway id by name, or pick which pathway to clone or edit.
argument-hint: "[name-filter]"
allowed-tools:
  - "mcp__bland__bland_api_get"
  - "mcp__bland__search_bland_docs"
  - "mcp__bland__query_docs_filesystem_bland"
  - "Read"
  - "Glob"
---

# List Bland Pathways

Show the pathways available to the configured Bland account. The API key is injected by the MCP connection; it is never handled here.

Optional argument: `$ARGUMENTS` — an optional name/substring filter.

Steps:

1. **List via the passthrough.** Call `mcp__bland__bland_api_get` with `{ path: "/v1/pathway" }` — the LIST endpoint is `/v1/pathway` (singular). Do NOT use `/v1/pathways` (it 404s). Unwrap the `{ data: … }` envelope and read the `data[]` array of pathways. This is a read-only GET and needs no confirmation.
2. If a filter argument was given (`$ARGUMENTS` non-empty), only show pathways whose `name` or `id` matches it, and note the filter applied.
3. Render the result as a compact list: `name` — `pathway_id` — current version — last updated.
4. **Mark which pathway is cloned locally.** `Glob`/`Read` the local baseline at `.norm/baseline.json` (written on clone). If it exists, match its `pathway_id` against the listed entries and flag that one as the locally cloned workspace.
5. If the GET fails because auth is missing or invalid, say exactly that and point the user at the plugin's `bland_api_key` / `bland_api_url` config; do not invent pathway entries.

After listing, suggest the next step: `/norm:clone <pathway_id>` to start editing, or `/norm:clone new "<name>"` to create a fresh pathway.
