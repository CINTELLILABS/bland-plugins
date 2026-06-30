---
description: "Convergence loop — keep editing a pathway and re-testing until it passes a fixed target (scenarios derived from a reference transcript or a goal). An evaluator-optimizer loop, gated by the Stop hook until it converges, hits max iterations, or stalls."
argument-hint: "<pathway_id> [--from-call <id> | --transcript <file> | --goal '<objective>'] [--max N]"
allowed-tools:
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs\":*)"
  - "Bash(node \"${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs\":*)"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
disallowed-tools:
  - "AskUserQuestion"
---

# Norm — Convergence Loop

Run an evaluator-optimizer loop: keep editing the pathway until it passes a **fixed** target. You (the optimizer) edit the pathway *files*; a fixed set of scenarios (the evaluator) is the pass/fail ground truth. The Stop hook (`hook-loop.cjs`) drives the loop — you do ONE iteration per turn, then end; if the target still fails you are re-prompted with the concrete failures until it passes, hits max iterations, or stalls.

Request:

```text
$ARGUMENTS
```

Parse `$ARGUMENTS` as a pathway id plus exactly one target source — `--from-call <call_id>`, `--transcript <file>`, or `--goal "<objective>"` — and optional `--max N` (default 6).

## Setup (first turn only)

1. **Clone** the pathway into the local workspace so you edit it as files:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" clone <pathway_id>
   ```
2. **Define the target ONCE** (the fixed pass criterion — never change it mid-loop):
   - `--from-call`: `generate_from_call(call_id, pathway_id)` → a Helix test case from a real Bland call. Capture the scenario id(s).
   - `--transcript`: read the file, then `create_agent_test_scenario` with explicit assertions that encode the gold transcript — `NODE_REACHED` / `NODES_VISITED` (routing), `VARIABLE_EXTRACTED` (slots), `LLM_JUDGE` / `STRING` / `REGEX` (content), `WEBHOOK_TRIGGERED` (side effects). Capture the scenario id(s).
   - `--goal`: `generate_goals` (or `create_agent_test_scenario`) from the objective. Capture the scenario id(s).
3. **Initialize the loop:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs" init <pathway_id> --max <N> --scenarios <id,id> --goal "<objective>"
   ```
4. Then immediately run iteration 1 (below).

## Each iteration

1. Read `.norm/loop.json` → `last_result.failing`.
2. **Edit the pathway FILES** to fix EXACTLY those failures — a minimal, targeted change, not a rewrite. Prose (`node.md` / `condition.md` / edge labels / `global_prompt.md`) with native `Read`/`Edit`; structured surfaces (variables, model, node tools, unit tests) ONLY via the `set_*` MCP tools.
3. **Commit:** `node "${CLAUDE_PLUGIN_ROOT}/bin/norm-sync.cjs" commit`.
4. **Re-run the target:** `run_agent_test_scenario` (or `run_agent_test_batch`) for the scenario id(s); poll `get_agent_test_run` for the assertion results; use `get_scenario_failure_context` for failure detail.
5. **Record the result (ground truth):**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/norm-loop.cjs" record --passed <true|false> --failing "<failing assertions, ';' separated>"
   ```
6. If ALL assertions pass, output `<promise>CONVERGED</promise>` and end. Otherwise just end your turn — the Stop hook re-feeds the failures for the next iteration.

## Rules

- **Ground truth only:** a scenario passes when `get_agent_test_run` reports its assertions passed — never record `--passed true` on a hunch (self-reported "looks done" is the failure mode).
- **Never change the target mid-loop,** and fix only divergences that affect the assertions — chasing stylistic gaps means it never converges.
- **Do NOT use `helix_converge` / `helix_test_pathway` / `helix_debug_pathway`** — they apply fixes server-side and bypass the file model, causing drift. Edit files, commit, and test with the non-mutating scenario runners only.
- **Never ask the user.** The loop stops itself on pass, max iterations, or no-progress (the same failures twice).

When the loop ends, report: the pathway id + final version, converged (yes/no), iterations used, and any remaining divergences with their evidence.
