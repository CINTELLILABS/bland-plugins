---
description: Set up, run, and grade platform simulations (and test-chat probes) against a v2 agent — suite design from the agent's lanes, safety rails for live integrations, engine-trace grading, and the green-sweep bar. Use to verify a v2 agent after any push.
argument-hint: "<agent id, and what to verify>"
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Bash"
  - "mcp__bland__*"
  - "mcp__plugin_bland_bland__*"
---

# /norm:simulate — verification loop

Target:

```text
$ARGUMENTS
```

Load the `v2-testing` skill (API contracts, WS recipe, grading discipline) and `v2-runtime` (to predict correct behavior). Then:

1. **Safety analysis first.** Enumerate the agent's integrations from its snapshot; classify read vs write. Writes are OFF LIMITS for routine sims — personas must stop short of completing those branches. Pick a synthetic caller identity that read-lookups will miss. If a lane cannot be tested safely or reachably (data-gated, write-side), record it as UNCOVERED — do not fake coverage.
2. **Suite design.** ~1 scenario per terminal/lane + conduct probes (AI disclosure, human request). Prefix names (e.g. `MIG-FINAL:`) so reruns are idempotent — check existing scenarios before creating. Personas completable; probe timing explicit; assertions encode the source system's actual behavior, worded to ignore hang-up timing. `type: "LLM_JUDGE"` uppercase.
3. **Run** each scenario (`POST /v1/agent-testing/scenarios/:id/run`), poll runs to completion, collect transcript + `assertion_results`.
4. **Grade on traces.** For every failure, pull the engine's per-turn decisions before diagnosing. Classify: harness artifact → fix persona/request_data/assertion; judge flake → 3 reps, read reasoning; routing flake → harden the specific entry/edge description in the snapshot; real bug → fix snapshot. After ANY snapshot change, the bar resets: full suite green in ONE sweep on the new head.
5. **Test-chat probes** for scripted mechanics per the WS recipe (setup frame with request data, text turns, keepalive). Use them to eyeball greeting, lane entry, disclosure rules.
6. **Report**: per-scenario verdicts with judge reasoning, the head version everything passed on, uncovered lanes with the reason (data-gated / write-gated), and any snapshot changes made during hardening.
