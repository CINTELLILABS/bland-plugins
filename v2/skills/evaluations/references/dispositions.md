# Agent dispositions and structured post-call outputs

Dispositions are agent-scoped, versioned definitions for producing post-call
values and transforming them into output. They are not a scenario's visual tag,
a live route condition, a judge identity, or fields to add to the agent snapshot.

Access is checked in this order: 403 `ENTERPRISE_REQUIRED` for a non-enterprise
organization, then 404 when dispositions are not enabled for the organization.
Neither is evidence that the agent has no dispositions.

Base: `/v2/agents/:agentId/dispositions`. On the page
`/dashboard/agent/<agent id>/dispositions`, take `agentId` from `route.params`.
These APIs use camelCase fields; do not copy snake_case names from evaluation
APIs. Reads go through `bland_api_get`, writes through `call_bland_api`. Do not
write fetch scripts and do not search the docs for these routes. No write here
refreshes the open page: after one, say "Saved through the API. The page shows
it after a refresh."

## Contents

- [Lifecycle and operations](#lifecycle-and-operations)
- [Field-level draft edits](#field-level-draft-edits)
- [Test runs](#test-runs)
- [Definition and dependencies](#definition-and-dependencies)
- [Extractors, annotations and calibration](#extractors-annotations-and-calibration)
- [Backfill](#backfill)
- [Migrating v1 citations and outcomes into dispositions](#migrating-v1-citations-and-outcomes-into-dispositions)
- [Confirm before](#confirm-before)

## Lifecycle and operations

| Task | Operation relative to base | Important contract |
|---|---|---|
| Inventory/create | `GET /`, `POST /` | Create uses `key` (`^[a-z][a-z0-9_]*$`, up to 64) and `definition`; returns identity and draft state. |
| Read | `GET /:id`, `GET /:id/draft`, `GET /:id/versions[/:versionId]` | Draft revision differs from immutable published version. |
| Edit draft (whole) | `PATCH /:id/draft` | `{expectedDraftRevision, definition}`; preserve the concurrency fence. |
| Edit draft (one field) | `POST /:id/draft/ops` | The normal path. See [Field-level draft edits](#field-level-draft-edits). |
| Estimate | `POST /:id/estimates` | Inspect current request and returned cost/admission constraints. |
| Publish | `POST /:id/publish` | `{expectedRevision, expectedVersionId?, estimateId, acknowledgeEstimate:true}`. `expectedRevision` is the canonical fence; `expectedDraftRevision` is an accepted alias and must agree when both are sent. `expectedVersionId` pins the editable row itself, so a freshly forked row that restarted at revision 1 cannot pass the fence. This can enable recurring billed work. |
| Roll back | `POST /:id/rollback` | `{version_id, expectedRevision}`. Points the live version at an earlier published version and replaces the draft with a copy of it. Unpublished draft edits are lost. A disabled disposition stays disabled. 409 `DISPOSITION_NOT_PUBLISHED`, 422 `ROLLBACK_TARGET_NOT_FOUND` or `ROLLBACK_TARGET_NOT_PUBLISHED`. |
| Stop/delete | `POST /:id/disable`, `DELETE /:id` | These are different lifecycle actions; inspect current state and intended effect. |
| Test | `POST /:id/runs` | See [Test runs](#test-runs). |
| Follow and inspect | `GET /:id/runs[/:runId]`, `GET /:id/runs/:runId/rows` | Reconcile row outcomes, missing evidence and failures; completed generation is not a passing result. |
| Report | `GET /:id/runs/:runId/export.csv` | Existing report download, not permission to create a new bulk-export service. |
| Per-call results | `GET /call-runs?callIds=<id>,<id>` | Which dispositions ran on the given calls. |
| Correct / align | Case annotation endpoints and `POST /:id/runs/:runId/align` | An annotation is evidence; alignment proposes changes, not implicit production deployment. |

## Field-level draft edits

`POST /:id/draft/ops` applies one edit. Every op carries `expectedRevision`
(the draft's current revision; 409 with the current revision on mismatch) and
optional `expectedVersionId`, and bumps the revision by exactly 1. Ops that
add, change or remove a value may carry the replacement `transformation`, so
the draft never references a missing value.

| `op` | Other keys |
|---|---|
| `add_value` | `value`, optional `index`, optional `transformation` |
| `update_value` | `valueId`, `changes` (any of `key`, `label`, `schema`, `source`), optional `index`, optional `transformation` |
| `remove_value` | `valueId`, optional `transformation` |
| `set_timing` | `timing` |
| `set_webhook` | `postCallWebhook` |
| `set_meta` | optional `name`, `description`, `transformation` |

```json
{"op":"set_webhook","expectedRevision":7,"postCallWebhook":{"mode":"hold","maxHoldSeconds":600}}
```

Prefer an op over the whole-draft PATCH: it cannot overwrite a field someone
else changed.

## Test runs

`POST /:id/runs` takes one of two bodies, never both:

- Current: `target` (`draft` or `published`), optional `executionSla`
  (`realtime` or `queued`), and `population`, either
  `{"mode":"recent","environment":"production","requestedSize":<1 to 500>}` or
  `{"mode":"calls","callIds":[…]}` with 1 to 500 unique call IDs.
- Frozen replay: `{"replayRunId":"<run id>"}` reruns the original run's inputs.
  Testing a newly edited draft is a different operation.

Limit: 10 test runs per hour per organization. Freeze the actual cohort,
target and execution SLA in your report.

## Definition and dependencies

- A definition has `name` (up to 120), `description` (up to 2000), `timing`,
  `values` (up to 50), `transformation` and `postCallWebhook`. Timing choices
  are `immediate` and `within_24h`; timing is not a guarantee of zero-latency
  completion.
- Values have typed producers and schema constraints. Discover the supported
  source kinds through `judge-catalog`, `variable-catalog`, `extractor-catalog`
  and `model-profile-catalog` rather than inventing expression or output keys.
- Judge sources pin evaluation versions. Read the pinned one with
  `GET /judges/:judgeId/versions/:versionId`. Structured extraction and code
  sources have their own versioned dependencies. A newly edited judge/extractor
  is not automatically the artifact an older disposition runs.
- The transformation combines values using the supported expression schema.
  Validate dependencies and output shape; missing/failed inputs are not a valid
  empty success value.
- `postCallWebhook.mode` (`hold` or `emit_followup`) affects delivery coordination.
  It is not another webhook URL field. `hold` publishes only with `immediate`
  timing. `maxHoldSeconds` (integer, 1 or more) bounds how long the call's
  webhook waits for values. Absent means 1800. Publish refuses a value above
  1800. When several held dispositions apply to one call, the shortest hold
  wins. Verify the delivered payload and timing through call/webhook evidence;
  call completion alone proves neither.

## Extractors, annotations and calibration

The same base exposes `extractors`. Extractors have their own editable version,
draft revision, publication and immutable version reads. Create with `key`,
`name`, `promptMd`, `outputSchema` and `inferenceConfig` (optional
`description`, `systemPromptMd`, `scopedToAgent`). Use
`PATCH /extractors/:id/draft` and `POST /extractors/:id/publish` with the live
schema; do not assume their body is identical to a disposition or evaluation
judge body.

Human correction endpoint:
`PUT /:id/runs/:runId/cases/:callId/annotations/:valueId`; GET the same path for
revision history. Body `{state, value?, explanation}`: `state` is `produced` (send
the corrected `value`) or `no_value`; `explanation` is 40 to 4000 characters.
Revisions are append-only; limit 300 per hour per organization. Only annotate an
authorized, observed value; distinguish a correction from an explanation of
insufficient evidence. Retain input/run/value identity and version when
comparing alignment suggestions.

`POST /:id/runs/:runId/align` reads the corrections of a finished run and
returns proposed text edits. It saves nothing. Limit 30 per hour per
organization. Apply accepted edits through draft ops (and a judge fork or
extractor publish where the proposal touches one), then re-test.

Calibrate with known pass/fail/missing-evidence cases, inspect row-level results,
then apply only reviewed changes to the intended draft. Re-test it before any
authorized publication. Do not expose private inference routing metadata in
reports, generated examples, or troubleshooting messages.

## Backfill

A backfill scores past calls with one published version. It is billed and
counts against a limit of 10 per hour per organization (estimates included).

1. **Availability.** `GET /backfill-availability` returns `{enabled}`. When
   `false`, stop: backfills are not available to this organization (a create
   answers 403).
2. **Estimate.** `POST /:id/estimates` with `{"backfill":{…}}`. The inner body
   is either a window or a list of calls:
   - `{"versionId":"<optional>","window":{"start":"<ISO instant>","end":"<ISO instant>"},"sampling":<optional, up to 1>}`.
     The window is `[start, end)`, at most 92 days, starting no more than 400
     days ago.
   - `{"versionId":"<optional>","callIds":[…]}` with up to 500 unique IDs inside
     the same date bounds.
   An absent `versionId` means the live published version. A draft cannot be
   backfilled. The answer carries `estimate`, `backfill.eligibleCalls`,
   `backfill.estimatedCostUsd` and `backfill.availableBalanceUsd`.
3. **Confirm** with the cost and call count (REQUIRED, below).
4. **Create.** `POST /:id/backfills` with the same inner body (no `backfill`
   wrapper). 201 returns the job. 402 when the estimate exceeds the available
   balance; 409 when this version already has a queued or running backfill or
   was never published; 400 when no completed call falls in the window.
5. **Follow.** `GET /:id/backfills/:jobId`, or `GET /:id/backfills/active`
   (optional `?versionId=`). Statuses: `queued`, `running`, `complete`,
   `partial`, `failed`, `cancelled`. Report `completedSize`, `failedSize`,
   `excluded` and `actualCostUsd`.
6. **Cancel** only when asked: `POST /:id/backfills/:jobId/cancel` (202).

## Migrating v1 citations and outcomes into dispositions

1. `GET /migrations/sources` lists the agent's v1 citation schemas and outcomes.
2. `POST /migrations` with `method` and `sources`
   (`citation_schema_ids`, `outcome_ids`, up to 20 each).
   - `direct` converts them as is, synchronously (201). It creates
     **drafts**; nothing runs until each is published.
   - `upgrade` (202) starts an asynchronous run that converts, then backtests
     the drafts against v1 results and refines them. Optional
     `backtest.requested_size` (1 to 500, default 25). At most 3 dispositions
     per run. Its test runs are billed.
3. Follow `GET /migrations/:runId` (stage `queued`, `authoring`, `backtesting`,
   `converging`, `finalizing`) until `COMPLETE`, `FAILED` or `CANCELLED`. Cancel
   with `POST /migrations/:runId/cancellations`.

One migration runs per agent at a time (409). Limits: 20 direct and 4 upgrade
starts per hour per organization. Review and publish the resulting drafts with
the normal estimate and publish steps.

## Confirm before

Publish, roll back, disable, delete, backfill, and an `upgrade` migration all
change billed or live output. Use this template, with the estimate's cost and
call count where there is one:

```text
About to <verb> <object>: <what changes, who is affected, cost or count>.
This <bills about $X for N calls | changes live post-call output | cannot be undone>.
Reply "yes" to proceed.
```
