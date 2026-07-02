---
description: "Systematic debugging for anything misbehaving on the Bland surface — reproduce it deterministically, isolate the layer (transport/auth vs contract vs behavior), fix it on the right surface, verify with the same repro. Use when a tool or endpoint errors, a webhook fails, a widget won't render, behavior contradicts the docs, or 'it worked yesterday'. Works on production or a dev server; fixes code when a server codebase is present, config otherwise."
argument-hint: "<what is broken / what to reproduce>"
allowed-tools:
  - "Task"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\")"
---

# Norm Debug

Debug anything misbehaving through the `norm_debug` agent, which owns the doctrine: deterministic repro file first (`.norm/repro/<slug>.md`), layer isolation (transport/auth vs contract vs behavior), fix dispatched to the right surface — pathway workspace files, account config through the passthrough, or the local server codebase when the working tree contains one (guided by that repo's own CLAUDE.md / project skills, never by plugin-baked internals) — then verification with the original repro.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_debug` agent (`Task` tool, `subagent_type: norm_debug`) with the user request verbatim. Optionally run `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"` first and pass along which server the connection points at (URL only — never the key).
2. The agent works for anyone: on production it repros against throwaway resources and fixes at the pathway/config level; with a server codebase in the working tree it adds the code-fix loop (edit → restart per the project's own docs → re-verify). Server-side bugs with no codebase present come back as escalation-ready repros — that is the correct outcome, not a failure.
3. Relay the agent's report intact: repro file, isolated layer, root cause with evidence, fix surface + what changed, before/after envelopes, and the regression protection left behind.
