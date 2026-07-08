---
description: "Self-test the Norm install in THIS environment — verify the MCP connection, tool namespace, config, and every read surface actually works here, and produce a pass/fail matrix. Use right after installing, after switching servers or keys, on a new machine/org, or before filing a bug ('is it me or the plugin?'). Read-only: places no calls, writes nothing."
argument-hint: "(no arguments)"
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\")"
  - "mcp__bland__bland_api_get"
  - "mcp__plugin_norm_bland__bland_api_get"
  - "mcp__bland__validate_pathway"
  - "mcp__plugin_norm_bland__validate_pathway"
  - "mcp__bland__get_pathway_schema"
  - "mcp__plugin_norm_bland__get_pathway_schema"
  - "mcp__bland__get_pathway_context"
  - "mcp__plugin_norm_bland__get_pathway_context"
  - "mcp__bland__get_call_log"
  - "mcp__plugin_norm_bland__get_call_log"
  - "mcp__bland__query_analytics"
  - "mcp__plugin_norm_bland__query_analytics"
  - "mcp__bland__search_bland_docs"
  - "mcp__plugin_norm_bland__search_bland_docs"
  - "mcp__bland__get_bland_mcp_setup"
  - "mcp__plugin_norm_bland__get_bland_mcp_setup"
---

# Norm Smoke — environment self-test

Run the checks below IN ORDER, continue past failures (never stop at the first), and end with the pass/fail matrix. Everything is a free read: no calls placed, no writes, no confirmations needed. This exists because bugs live in environment differences — Claude Code version, install path, org data shape, server target — so every fresh environment should prove itself once.

## Checks

1. **Namespace** — determine which prefix this session's Bland tools carry: `mcp__bland__*` or `mcp__plugin_norm_bland__*` (both are supported; report which one is live). If NEITHER exists, the MCP connection is down: report it, run check 2 anyway (the URL often explains it), then skip to the matrix.
2. **Config** — `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"` → report the target URL (prod vs a dev/localhost server) and that the key is stored separately. Never echo any key.
3. **Auth + account** — `bland_api_get { path: "/v1/me" }` → expect account JSON; report the org context it reflects.
4. **Calls read** — `bland_api_get { path: "/v1/calls", query: { limit: "1" } }` → expect a call (or a clean empty list on a fresh org). Keep the returned call id for check 8.
5. **Compiler, both directions** — `validate_pathway` on a tiny VALID 2-node graph (Default start → End Call, one edge) expecting `valid: true`, then on a BROKEN graph (single non-start node, no edges) expecting `valid: false` with named errors. A compiler that can't fail is not a pass.
6. **Contracts** — `get_pathway_schema { surface: "edge" }` and `get_pathway_context` (`scope: "pathway"`) on the tiny valid graph → expect a schema and a context summary.
7. **Analytics** — `query_analytics` with `{ table: "calls", metrics: [{ fn: "count", label: "calls" }], date_range: { since: "-7d" } }` → expect a numeric row (0 is a pass on a quiet org).
8. **get_call_log** — on the call id from check 4 (skip with a note if the org has no calls) → expect the call's transcript/metadata. A "not found" for an id that check 4 just returned is a KNOWN bug signature — flag it loudly with both results side by side.
9. **Docs** — `search_bland_docs` for "send call" → expect results (a docs-proxy outage degrades this without breaking anything else; report it as degraded, not failed).
10. **Error-path hygiene** — `bland_api_get { path: "/v1/does-not-exist-norm-smoke" }` → expect a clean 404 error, and then repeat check 4 to prove the session was not poisoned by it.

## Report

End with a matrix: `# | check | PASS/FAIL/DEGRADED/SKIPPED | evidence (one line, verbatim errors)`. Then a one-line verdict: fully healthy / degraded (what still works) / broken (the first thing to fix — usually URL or key, via `/norm:config` or `/plugin configure norm@bland`, then restart). For any FAIL, include the exact tool call + response so the matrix doubles as a bug report.
