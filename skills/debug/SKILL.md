---
name: debug
description: "Use when something on the Bland surface misbehaves and needs SYSTEMATIC root-cause debugging: a v2 agent routing wrong or looping, a variable extracting badly, a tool or webhook failing, a native tool call misfiring, an MCP tool or endpoint erroring, a channel not answering, behavior contradicting the docs, or 'it worked yesterday'. It enforces the four-phase discipline (root-cause investigation, pattern analysis, single hypothesis, minimal fix with a failing repro first) for v2 agents: call evidence per pipeline boundary, version diffs, exact-version tests, and triage-ready escalation packs. v1 pathways are read-only evidence; their fix is a v2 change or a migration."
license: MIT
---

# Systematic debugging for v2 agents

Before server work, read [API tool selection](../api/references/tool-selection.md).

Server binding: all API work goes through this plugin's own Bland MCP server (`bland`). Never switch to another installed or project-scoped Bland server; it may hold another organization.

If the `superpowers:systematic-debugging` skill is available in this session, invoke it first and treat everything below as its Bland specialization. Otherwise this doctrine is self-contained. The v2 evidence procedure is in [debugging](../../v2/skills/api-workspace/references/debugging.md); read it before Phase 1.

## The Iron Law

**NO FIXES WITHOUT ROOT-CAUSE INVESTIGATION FIRST.** A fix proposed before Phase 1 is complete is a guess, and guesses in agents create the worst kind of bug: one that moves. "It's probably the prompt, let me reword it" is the red flag. Stop and return to evidence.

## Phase 1: root-cause investigation

1. **Read the actual error, verbatim.** The failing envelope, `error_message` on the call, validation errors from the version save, MCP codes (`-32000` = swept session, retry once; `-32003` = rate limit; 401/403/404 = auth, role or wrong server; check the URL with `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-config.cjs"`, never the key). Chronic contract traps: `call_bland_api` bodies are native JSON objects, `bland_api_get` query values are strings.
2. **Confirm which version answered.** A v2 call record carries `agent_id` and `agent_version_id`. Read that version's snapshot. "The fix didn't take" is usually the wrong version, not routing ([which version runs](../../v2/skills/v2-runtime/SKILL.md)). Read `settings.nativeToolCalling` on it: a native version and a legacy version misfire in different ways ([native function calling](../../v2/skills/v2-runtime/references/native-function-calling.md)).
3. **Reproduce deterministically before theorizing.** Agent behavior: a test chat or text simulation pinned to that exact version ([v2 testing](../../v2/skills/v2-testing/SKILL.md), [turn-by-turn probes](../../v2/skills/v2-testing/references/probes.md)). Real-call bugs: the call's own record. API bugs: the exact failing tool call. Save the repro to `.norm/repro/<slug>.md` (request, expected, actual). A bug without a repro file is a rumor. Simulations can run real integrations; classify side effects first. Never mutate a live object to "test".
4. **Check recent changes: the version diff.** List versions (`GET /v2/agents/<id>/versions`), read the last-known-good snapshot and the failing one, and diff them in workspace files. This is the `git diff` for behavior. Run it before you read a single prompt.
5. **Gather evidence at each pipeline boundary.** The call record is the instrumentation:

| Boundary | Evidence source |
|---|---|
| What speech recognition heard | transcript user turns (against the recording if recognition is the suspect) |
| Route selection | the engine trace for the turn, edge labels and conditions, `route` rules |
| Loop condition | the step's `loopWhile`, the repeated step in the trace |
| Variable extraction | the variable timeline, the extraction rows' descriptions |
| Tool or webhook | tool logs (`GET /v2/tools/logs?call_id=`), status, request and response bodies |
| Native tool calls | which tool was offered on the step, the arguments the model sent, held drafts |
| Post-call | dispositions, post-call webhook deliveries |

6. **Trace bad values to their source.** A wrong value spoken in a recap traces backward through the variable timeline to the extraction step, `request_data`, or a tool response. Fix at the source, never at the symptom.

For a past **v1 pathway** call, `pathway_logs`, `get_pathway_context` and `validate_pathway` with a baseline are still valid read-only evidence ([call-review](../call-review/SKILL.md)). Do not edit or save the pathway.

## Phase 2: pattern analysis

Find what works before touching what doesn't: a sibling step whose loop releases, a previous version that behaved, or a passing call on the same version. Diff the two calls' traces: where do their decisions diverge? Compare against the authoritative references completely: [snapshot dialect](../../v2/skills/v2-snapshot/SKILL.md), [runtime rules](../../v2/skills/v2-runtime/references/runtime-rules.md), [builder/runtime map](../../v2/skills/v2-runtime/references/builder-runtime-map.md), and the docs via `search_bland_docs`. List every difference; don't assume "that can't matter".

## Phase 3: single hypothesis, tested minimally

State it in domain terms: "the loop never releases because the hold condition needs `appointment_time`, which no step extracts." Test with the smallest probe (one pinned test chat, one contract read), one variable at a time. Hypothesis dead? Form a new one from the evidence; never stack a second speculative fix on the first.

## Phase 4: implementation

1. **Failing repro first.** The repro (or a frozen simulation scenario with the bug as a failing assertion) must fail BEFORE the fix, so the fix has something to prove.
2. **One minimal fix at the root surface**: a stable-ID patch to the v2 agent version ([v2 maintenance](../../v2/skills/v2-maintenance/SKILL.md)), account configuration through the passthrough (confirm-gated), or the server codebase when the working tree holds one (follow that repo's own guidance; never guess internals). When the failing call ran on a v1 pathway, the fix is the same change on the v2 agent that replaces it, or a migration. No "while I'm here" improvements.
3. **Verify with the original repro** on the newly saved version, plus a normal path and an adjacent regression case. Grade with evidence quotes, never self-graded benefit of the doubt.
4. **The 3-fix rule.** Three failed fixes on the same symptom means the design is wrong, not under-tweaked. Stop and question the structure: when prose fails twice, change the construct, not the wording. Say so to the user; do not attempt fix #4 without that conversation.

## Escalation = triage, not surrender

When the root cause is out of reach (platform bug, no codebase, needs a product decision) or honest investigation ends at "not reproducible": assemble the **triage pack**: repro file, call ids, agent id and version, step and edge ids, the evidence rows that matter, every hypothesis tested and its result. Hand it to the triage skill. A documented dead end with a clean pack is a successful outcome.

## Guardrails

Never print, read or pass the API key; URLs are not secrets, the key always is. Server writes stay confirm-gated, and saving a version is not publishing it. Edit a local server codebase freely but never commit or push unless asked. Before anything destructive, state which server the connection points at. Report honestly: a repro that stopped failing for unknown reasons is "not reproducible", not "fixed".

## Reporting

Always report: the repro (path + one line), the phase trail (evidence → pattern → hypothesis → fix), the root cause with the decisive evidence rows, the fix surface and the saved version, before and after results on that exact version, and the regression protection left behind, or the triage pack if escalated.
