# Agent dispositions and structured post-call outputs

Dispositions are agent-scoped, versioned definitions for producing post-call
values and transforming them into output. They are not a scenario's visual tag,
a live route condition, a judge identity, or fields to add to the agent snapshot.
Availability is account/feature dependent. A 403/404 is not evidence the agent
has no dispositions; distinguish access, rollout and missing resource.

Base: `/v2/agents/:agentId/dispositions`. Read the current schema through the
authenticated docs/API tools before authoring complete definitions. These APIs
use camelCase fields; do not copy snake_case names from evaluation APIs.

## Lifecycle and operations

| Task | Operation relative to base | Important contract |
|---|---|---|
| Inventory/create | `GET /`, `POST /` | Create uses `key` and `definition`; return identity and draft state. |
| Read | `GET /:id`, `GET /:id/draft`, `GET /:id/versions[/:versionId]` | Draft revision differs from immutable published version. |
| Edit draft | `PATCH /:id/draft` | `{expectedDraftRevision, definition}`; preserve concurrency fence. |
| Estimate | `POST /:id/estimates` | Inspect current request and returned cost/admission constraints. |
| Publish | `POST /:id/publish` | Requires `expectedDraftRevision`, `estimateId`; explicit `acknowledgeEstimate:true` only when authorized/required. This can enable recurring billed work. |
| Stop/delete | `POST /:id/disable`, `DELETE /:id` | These are different lifecycle actions; inspect current state and intended effect. |
| Test | `POST /:id/runs` | Draft/published target plus population, or frozen replay by `replayRunId`. |
| Follow and inspect | `GET /:id/runs[/:runId]`, `GET /:id/runs/:runId/rows` | Reconcile row outcomes, missing evidence and failures; completed generation is not a passing result. |
| Report | `GET /:id/runs/:runId/export.csv` | Existing report download, not permission to create a new bulk-export service. |
| Correct / align | Case annotation endpoints and `POST /:id/runs/:runId/align` | An annotation is evidence; alignment proposes changes, not implicit production deployment. |

Supported test population forms include bounded recent production calls or
explicit `callIds` (currently up to 250 per request). Freeze the actual cohort,
target and execution SLA (`realtime` or `queued` when supported). A frozen replay
uses the original run's inputs; testing a newly edited draft is a different
operation. Do not add both modes to one request.

## Definition and dependencies

- A definition has `name`, `description`, `timing`, `values`, `transformation`
  and `postCallWebhook`. Current timing choices are `immediate` and `within_24h`;
  timing is not a guarantee of zero-latency completion.
- Values have typed producers and schema constraints. Discover the supported
  source kinds and catalogs rather than inventing expression or output keys.
- Judge sources pin evaluation versions. Structured extraction and code sources
  have their own versioned dependencies. A newly edited judge/extractor is not
  automatically the artifact an older disposition runs.
- The transformation combines values using the supported expression schema.
  Validate dependencies and output shape; missing/failed inputs are not a valid
  empty success value.
- `postCallWebhook.mode` (`hold` or `emit_followup`) affects delivery coordination.
  It is not another webhook URL field. Verify the delivered payload and timing
  through call/webhook evidence; call completion alone proves neither.

## Extractors, annotations and calibration

The same base exposes `judge-catalog`, `variable-catalog`, `extractor-catalog`
and `extractors`. Extractors have their own editable version, draft revision,
publication and immutable version reads. Use `PATCH /extractors/:id/draft` and
`POST /extractors/:id/publish` with the live schema; do not assume their body is
identical to a disposition or evaluation judge body.

Human correction endpoint:
`PUT /:id/runs/:runId/cases/:callId/annotations/:valueId`; GET the same path for
revision history. Only annotate an authorized, observed value; distinguish a
correction from an explanation of insufficient evidence. Retain input/run/value
identity and version when comparing alignment suggestions.

Calibrate with known pass/fail/missing-evidence cases, inspect row-level results,
then apply only reviewed changes to the intended draft. Re-test it before any
authorized publication. Do not expose private inference routing metadata in
reports, generated examples, or troubleshooting messages.
