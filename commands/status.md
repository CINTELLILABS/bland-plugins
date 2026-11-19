---
description: Self-test the Bland plugin install in this environment (MCP connection, tool namespace, config, the v2 agent reads and every other read surface). Use after setup, after a key or server switch, on a new machine, or when the user asks whether the plugin works. Runs reads only.
argument-hint: "[--check]"
allowed-tools:
  - "mcp__bland__*"
  - "mcp__plugin_bland_bland__*"
  - "Read"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\")"
---


Before server work, read [API tool selection](../skills/api/references/tool-selection.md). Prefer available generic proxies; if the required proxy is absent, use an exact named equivalent with its live schema. This overrides proxy-only wording below, not approval or evidence gates. If no equivalent is connected, report the missing method + route and blocked step; never invent a tool.

# Bland environment self-test

Run the checks below IN ORDER, with or without `--check`. Continue past failures (never stop at the first) and end with the pass/fail matrix. Everything is a free read: no calls placed, no writes, no confirmations needed. This exists because bugs live in environment differences (host version, install path, org data shape, server target) that a single machine cannot expose.

1. **Namespace**: determine which prefix this session's Bland tools carry: `mcp__bland__*` or `mcp__plugin_bland_bland__*` (both are supported; report which one is live). If NEITHER exists, the MCP connection is down: report it, run check 2 anyway (the URL often explains it), then skip to the matrix.
2. **Config**: `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"` → report the target URL (prod vs a dev/localhost server) and that the key is stored separately. Never echo any key.
3. **Auth + account**: prefer `bland_api_get { path: "/v1/me" }`; if absent, use `get_account_details {}` → expect account JSON; report the org context it reflects and which tool was used.
4. **Calls read**: prefer `bland_api_get { path: "/v1/calls", query: { limit: "1" } }`; if absent, use `list_calls { limit: 1 }` after inspecting the live schema → expect a call (or a clean empty list on a fresh org). Keep the returned call id for check 8. If neither equivalent is connected, mark only this check SKIPPED with the missing route.
5. **Agents read**: `list_agents` (or `bland_api_get { path: "/v2/agents" }`) → expect the org's v2 agents, or a clean empty list. Keep one agent id for check 6.
6. **Agent version read**: `get_latest_agent_version` for that agent (or `bland_api_get { path: "/v2/agents/<id>/versions/latest" }`) → expect a snapshot. Report whether `settings.nativeToolCalling` is `true`. Skip with a note when the org has no agents or the agent has no saved version.
7. **Analytics**: `query_analytics` with `{ table: "calls", metrics: [{ fn: "count", label: "calls" }], date_range: { since: "-7d" } }` → expect a numeric row (0 is a pass on a quiet org).
8. **get_call_log**: on the call id from check 4 (skip with a note if the org has no calls) → expect the call's transcript and metadata. A "not found" for an id that check 4 just returned is a KNOWN bug signature: flag it loudly with both results side by side.
9. **Docs**: `search_bland_docs` for "send call" → expect results (a docs-proxy outage degrades this without breaking anything else; report it as degraded, not failed).
10. **Error-path hygiene**: when `bland_api_get` exists, call `{ path: "/v1/does-not-exist-bland-check" }` → expect a clean 404 error, then repeat check 4 to prove the session was not poisoned. With named-only tools mark this check SKIPPED (no exact tool for a deliberately nonexistent route); do not invent a tool or deliberately mutate an account to probe errors.

For every check, inspect availability first. An absent dedicated tool is SKIPPED with the missing capability; permission/auth failures are FAIL, not a trigger to switch tools. A healthy named-only connection may skip some checks without being broken.

End with a matrix: `# | check | PASS/FAIL/DEGRADED/SKIPPED | evidence (one safe line)`. Then a one-line verdict: fully healthy / degraded (what still works) / broken (the first thing to fix, usually URL or key; see the setup skill, then restart). For any FAIL, include the tool name, safe request fields, error category and request ID. Redact credentials, signed URLs and private account/call content; do not dump full sensitive responses or internal diagnostics.
