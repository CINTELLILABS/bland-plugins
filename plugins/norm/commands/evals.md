---
description: Build and run Bland evals — eval agents, workbench setups, test configs, and eval runs — then report pass-rates and per-dimension scores.
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

Orchestrate the user's eval request through the `norm_evals` agent, which owns the doctrine (judges → workbench setup → estimate → run → report). It uses the curated eval tools where they exist (`list_eval_agents`, `get_eval_agent`, `get_eval_run`, `create_eval_run`) and the generic REST passthrough (`call_bland_api` / `bland_api_get` against `/v1/evals/*`) for building judges, workbench setups, test configs, templates, and run-result drill-downs.

User request:

```text
$ARGUMENTS
```

Steps:

1. Launch the `norm_evals` agent (via the `Task` tool, `subagent_type: norm_evals`) and hand it the user request verbatim. Let it classify the work as building/picking eval agents, assembling a workbench setup, defining a test config, or executing an eval run.
2. For scoring work, have the agent pick or build the eval-agent judges (browse with the curated `list_eval_agents`; create via `call_bland_api` `POST /v1/evals/agents`, seeding from `GET /v1/evals/agent-templates`; confirm with the curated `get_eval_agent`, whose param is `id`), assemble the workbench setup through the passthrough (`POST /v1/evals/workbench-setups`) and configure its version (attached agents, weights, target levels, `pass_threshold_pct`, default call ids), and resolve the calls or agents to score. Have it discover exact paths in the docs first.
3. Preview the eval run's cost and size before executing (via the documented estimate endpoint through the passthrough), and report it before creating the run with the curated `create_eval_run`.
4. Before any high-impact action — publishing an eval agent or workbench setup, deleting anything, applying run tags, cancelling a run, creating a billed run, or any real outbound call/message — get explicit user confirmation. Gate by intent on the `call_bland_api` method+path, not just by tool name. Read-only `/v1/evals/*` GETs, curated reads, estimates, and polling never need it.
5. Final answer must include the concrete ids and outcomes: eval agent ids, the workbench setup id and version, the run id, terminal status, the overall pass-rate against `pass_threshold_pct`, and per-dimension/per-agent scores. If a requested capability has no curated tool and no documented `/v1/evals/*` endpoint (for example agent-to-agent test scenarios), say so plainly rather than inventing it.

Do not hand-simulate conversations or invent ids, scores, or verdicts when Bland tooling is available.
