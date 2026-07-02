---
description: "Systematic root-cause debugging for anything misbehaving on the Bland surface — the four-phase discipline (investigate → pattern-match → single hypothesis → minimal fix with a failing repro first), specialized to pathways and agents. Use when a pathway routes wrong or loops, a variable extracts badly, a webhook/tool or endpoint errors, a widget won't render, or 'it worked yesterday'. Confirmed-out-of-reach bugs become triage-ready evidence packs."
argument-hint: "<what is broken / what to reproduce>"
allowed-tools:
  - "Task"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs\")"
---

# Norm Debug

Debug anything misbehaving through the `norm_debug` agent, which enforces the systematic-debugging discipline (the superpowers methodology, specialized to this domain): **no fixes before root-cause investigation** — deterministic repro file first (`.norm/repro/<slug>.md`), evidence per pipeline boundary (transcript / decision entries / variable timeline / webhook records / contract context-windows), pathway version diffs via change-aware validation, a single contract-confirmed hypothesis, then ONE minimal fix at the root surface with the failing repro as proof, and the 3-fix rule (three failures = structural problem, stop and question the design). Out-of-reach bugs come back as triage-ready evidence packs for `/norm:triage`.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_debug` agent (`Task` tool, `subagent_type: norm_debug`) with the user request verbatim. Optionally run `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"` first and pass along which server the connection points at (URL only — never the key).
2. The agent works for anyone: on production it repros against throwaway resources and fixes at the pathway/config level; with a server codebase in the working tree it adds the code-fix loop (edit → restart per the project's own docs → re-verify). Server-side bugs with no codebase present come back as escalation-ready repros — that is the correct outcome, not a failure.
3. Relay the agent's report intact: repro file, isolated layer, root cause with evidence, fix surface + what changed, before/after envelopes, and the regression protection left behind.
