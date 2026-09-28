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
  "prompt_md":"Determine whether the agent requested and received explicit confirmation before committing a booking. Cite the relevant turns. If the supplied evidence cannot establish the criterion, return is_insufficient_evidence=true and selected_level_key=null in the structured judge result, explaining the missing evidence in reasoning_md. Do not infer failure or commitment from missing evidence.",
  "levels":[
    {"level_key":"not_confirmed","label":"Not confirmed","prompt_md":"The agent committed a booking without prior explicit caller agreement."},
    {"level_key":"confirmed","label":"Confirmed","prompt_md":"The caller explicitly agreed before the booking was committed."}
  ],
  "target_level_keys":["confirmed"]
}
```

Order scored levels worst to best: numeric scoring maps the first to 0 and the
last to 100. Target keys specify the passing level independently.

Only judge what the chosen evidence can establish. If backend commitment is not
observable in transcript evidence, add supported tool/call evidence or report
insufficient evidence; do not infer commitment from reassuring language alone.

- Restrict this judge's cohort to applicable booking cases. Report cases with no
  booking attempt as not applicable, separately from scored results. If cohort
  eligibility is unknown, establish it before claiming a booking pass rate.
- Missing evidence uses the judge's structured `is_insufficient_evidence:true`
  and `selected_level_key:null` (or `verdict:null` for a pass/fail judge), not a
  custom failure or “inconclusive” level. These are judge output fields, not new
  PATCH configuration keys. Prompt wording alone does not prove compliance:
  inspect the actual result and its explanation of the missing evidence.
- The literal custom level `inconclusive` is excluded from numeric scoring in
  the current contract, but can still produce `is_target_match:false` (a non-match). It is not
  equivalent to the structured insufficient-evidence flag.
- Insufficient-evidence results have null score/target match and are excluded
  from scoring; they are not passes. A simulation summary can still count an
  all-insufficient call in its unsuccessful total. Report that separately from
  observed behavior failures and include the scored denominator.

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
   Despite the route name, this endpoint accepts the **set ID** returned by
   `/simulate`, not an individual run ID.
   The assembled result has `summary`, `assertions`, and `logs`.
   `summary.eval_run_id` may be null and arrays empty while scoring initializes.
   That is not proof that no judges were attached or the test passed.
7. Reconcile all three requested simulations against `logs[]` and
   `summary.total_calls` after generation/scoring. Each `logs[].run_id` identifies
   an individual scenario run; read `GET /v1/agent-testing/runs/{run_id}` for its
   details. One returned log is not evidence all three succeeded. Inspect the
   linked evaluation run when available; report execution status, judge
   assertions, conversation evidence, and missing/failed results separately.

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
