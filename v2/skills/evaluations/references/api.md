# Evaluation API map

Verified contract notes, not a replacement for the connected API documentation.
Re-check request schemas before using an unfamiliar option. Placeholder IDs
below must come from reads/creates in the intended organization.

## Judge identity and rubric are separate resources

| Operation | Route | Contract / next step |
|---|---|---|
| List/create judges | `GET /v1/evals/agents`, `POST /v1/evals/agents` | Create identity with `name`, optional `description`, `modality`, `agent_id`, or documented template selector. Do not send rubric fields here. |
| Read judge | `GET /v1/evals/agents/{id}` | Obtain its current/active version IDs; `agent_id` attribution means the voice agent, not another judge. |
| Read/edit version | `GET /v1/evals/agents/{id}/versions/{version_id}`, `PATCH` same path | Edit `prompt_md`, `system_prompt_md`, `levels`, `target_level_keys`, `weight`, or documented configuration on the version. |
| Fork version | `POST /v1/evals/agents/{id}/versions` | Optional `from_version_id`; follow with a version edit. |
| Publish judge | `POST /v1/evals/agents/{id}/publications` | Changes the active judge version. Read back both pointers; do not confuse this with publishing a voice agent. |

Minimal identity request:

```json
{"name":"Confirms before booking","modality":"text"}
```

Example PATCH body for an existing editable judge version:

```json
{
  "prompt_md":"Determine whether the agent requested and received explicit confirmation before committing a booking. Cite the relevant turns. If no booking was attempted or required evidence is missing, choose inconclusive.",
  "levels":[
    {"level_key":"confirmed","label":"Confirmed","prompt_md":"The caller explicitly agreed before the booking was committed."},
    {"level_key":"not_confirmed","label":"Not confirmed","prompt_md":"The agent committed a booking without prior explicit caller agreement."},
    {"level_key":"inconclusive","label":"Inconclusive","prompt_md":"No booking was attempted, or the transcript cannot establish ordering or commitment."}
  ],
  "target_level_keys":["confirmed"]
}
```

Only judge what the chosen evidence can establish. If backend commitment is not
observable in transcript evidence, add supported tool/call evidence or report
inconclusive; do not infer commitment from reassuring language alone.

## Test scenario with attached judges

1. `POST /v1/agent-testing/scenarios`: create the caller case using the
   [testing contract](../../v2-testing/SKILL.md). Keep the returned scenario ID.
2. `GET /v1/agent-testing/scenarios/{id}/eval-agents`: inspect existing attachments.
3. `POST /v1/agent-testing/scenarios/{id}/eval-agents`: attach one judge:

   ```json
   {"eval_agent_id":"<judge UUID>","eval_agent_version_id":"<version UUID>","weight":100,"target_level_keys":["confirmed"]}
   ```

4. `PUT` on that collection replaces the roster; prefer POST for an additive
   attachment so existing judges are not accidentally removed. Read back.
5. `POST /v1/agent-testing/scenarios/{id}/simulate` with
   `{"simulations_count":3}` starts conversation generation and scoring, returning
   202 and a `simulation_set_id`. This is not a completed score.
6. Poll `GET /v1/agent-testing/simulation-runs/{simulation_set_id}/results`.
   The assembled result has `summary`, `assertions`, and `logs`.
   `summary.eval_run_id` may be null and arrays empty while scoring initializes.
   That is not proof that no judges were attached or the test passed.
7. Inspect the linked evaluation run when available. Report execution status,
   judge assertions, conversation evidence, and missing/failed results separately.

The `/scenarios/{id}/run` → `/runs/{id}` inline-assertion workflow is different
from `/simulate` → `/simulation-runs/{id}/results`. Use the matching read path.
Never infer a v2 voice-agent version selector from the legacy `version_number`
field. Consult the current contract and verify the selected version in results;
for explicit candidate checks see [lifecycle checks](../../v2-lifecycle/references/api.md).

## Evaluate existing calls

| Operation | Route / notes |
|---|---|
| Save a cohort | `POST /v1/evals/test-configs` with documented name and `call_ids`; GET the returned resource to verify |
| Estimate | `POST /v1/evals/runs/estimates`, using the same selection body planned for the run |
| Start | `POST /v1/evals/runs`, returns an asynchronous run |
| Status | `GET /v1/evals/runs/{run_id}` |
| Call results | `GET /v1/evals/runs/{run_id}/call-results?include_agent_results=true`; follow documented pagination |
| Judge results | `GET /v1/evals/runs/{run_id}/agent-results` |
| Frozen roster | `GET /v1/evals/runs/{run_id}/agent-snapshots` |
| Cancel | `POST /v1/evals/runs/{run_id}/cancellations`, only when requested/authorized |

Selection example (not executable until real IDs are supplied):

```json
{
  "call_ids":["<call ID>"],
  "attached_agents":[{"eval_agent_id":"<judge UUID>","eval_agent_version_id":"<version UUID>"}],
  "run_mode":"text",
  "pass_threshold_pct":100
}
```

`call_ids` is required (1–5000 in this contract). Do not replace it with an
invented `test_config_id`: read the saved cohort and provide its IDs. A saved
workbench setup version can supply the pinned roster; consult its contract
instead of combining incompatible selection fields. Use the actual estimate's
counts and customer cost, never hardcoded pricing.

Run statuses: `PENDING`, `QUEUED`, `RUNNING`, then `COMPLETE`, `PARTIAL`, `FAILED`,
or `CANCELLED`. Queueing is not a failed judge. A run's `error_code` /
`error_message` describe execution; per-judge `failed`, `failure_code`, and
`is_insufficient_evidence` must be distinguished from `is_target_match:false`.
