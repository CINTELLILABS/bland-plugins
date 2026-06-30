---
description: Build and run Bland evals — eval agents, workbench setups, test configs, eval runs, and agent-to-agent test scenarios — then report pass-rates and per-dimension scores.
allowed-tools:
  - "Task"
  - "Read"
  - "Write"
  - "Edit"
  - "Glob"
  - "Grep"
  - "mcp__bland__*"
---

# Norm Evals

Orchestrate the user's eval request through the `norm_evals` agent, which owns the doctrine (judges → workbench setup → estimate → run → report, plus agent-to-agent scenarios).

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_evals` agent (via the `Task` tool, `subagent_type: norm_evals`) and hand it the user request verbatim. Let it classify the work as building/picking eval agents, assembling a workbench setup, defining a test config, executing an eval run, or running an agent-to-agent test scenario.
2. For scoring work, have the agent pick or build the eval-agent judges (seeding from templates when useful), assemble the workbench setup and configure its version (attached agents, weights, target levels, `pass_threshold_pct`, default call ids), and resolve the calls or agents to score.
3. For behavior work, have the agent define the persona and goals, create the test scenario, and run it as a single scenario or a batch.
4. Always estimate the eval run for cost and size before executing, and report the estimate before proceeding.
5. Before any high-impact action — publishing an eval agent or workbench setup, deleting anything, applying run tags, cancelling a run, or any real outbound call/message — get explicit user confirmation. Read-only inspection, estimates, polling, and simulations never need it.
6. Final answer must include the concrete ids and outcomes: eval agent ids, the workbench setup id and version, the run id (or scenario/batch run id), terminal status, the overall pass-rate against `pass_threshold_pct`, and per-dimension/per-agent scores (or the scenario verdict and decisive transcript evidence).

Do not hand-simulate conversations or invent ids, scores, or verdicts when Bland tooling is available.
