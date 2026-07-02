---
description: "Systematic dev-server debugging — reproduce a failing MCP call or endpoint against YOUR local/staging Bland server, isolate the layer, fix it in your local server codebase, and verify with the same repro. Use when the plugin is pointed at a dev tunnel and a tool errors, an endpoint misbehaves, a widget won't render, or a local server change needs repro→fix→verify. Not for pathway content bugs (/norm:norm, /norm:loop) or prod call review (/norm:review)."
argument-hint: "<what is broken / what to reproduce>"
allowed-tools:
  - "Task"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\")"
---

# Norm Dev Mode

Debug the server behind the plugin — the user's OWN dev/staging deployment — through the `norm_dev` agent, which owns the doctrine: deterministic repro file first (`.norm/repro/<slug>.md`), layer isolation (transport/auth vs contract vs behavior), smallest fix in the local codebase following the project's own skill/CLAUDE.md for rebuild/restart steps, then verification with the original repro (retrying once after restart, since the MCP session is swept).

User request:

```text
$ARGUMENTS
```

Steps:

1. **Check dev mode first**: run `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"` and read the URL. If it is production (`api.bland.ai`), tell the user this command is for dev servers — point them at `/norm:config <https-tunnel-url>` (plus a session restart) and stop. Read-only prod diagnosis belongs to `/norm:review` or `/norm:api`.
2. Launch the `norm_dev` agent (`Task` tool, `subagent_type: norm_dev`) with the user request verbatim plus the confirmed dev URL.
3. The agent knows no server internals by design — it discovers rebuild/restart steps from the project's own `CLAUDE.md` / project skills in the working tree, and asks once if none exist. IP about any specific server stays in that server's private repo, never in this plugin.
4. Relay the agent's report intact: repro file, isolated layer, root cause with evidence, what changed + what restarted, before/after envelopes, and the regression protection left behind.
