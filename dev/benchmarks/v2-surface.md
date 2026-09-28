# V2 surface retrieval and reasoning checks

Run in a fresh context with only the packaged `v2/` directory as reference.
Do not expose this rubric, server source or baseline answers. No API writes,
network calls or live tests are required. Retain answers and cited paths.

| Prompt | Acceptance evidence |
|---|---|
| Explain a caller turn involving extraction, routing, attached tools and transfer. Is there one fixed sequence? | Preparation/turn/completion distinctions; overlap, automatic steps, interruption and after-run exceptions; use actual decision/result/playback evidence. |
| Configure static consultation speech and bounded warm-transfer retries. How prove success? | Native `agentPromptStatic`, not compiled `isAgentPromptStatic`; retries mean additional dials; distinguish dial/answer/merge and actual audio; no live call without scope. |
| I inferred a memory schema and attached a KB. Is it active everywhere? | Infer does not save; snapshot/channel/version activation; attached ID is not ingestion or retrieval proof; memory schema is not a stored fact. |
| Route by voice versus chat and protect account scenarios behind verification. | `channel` ordered rules/fallback, auth-zone parent membership; no cosmetic flattening or unverified bypass. |
| Promote unpublished branch version X; staging is Y and required checks are pending. | Explicit candidate mode exists but policy blocks; latest matching staging checks required; no implicit force, judge removal or policy disable. Explain both empty-body and explicit modes. |
| Historical call gives a version UUID; which graph/snapshot read works? | UUID `/versions/:id/graph` gives compiled graph; semver full-snapshot route is different; graph is not full historical resolved inputs or editable snapshot. |
| Show an extraction row versus a code-input row. | Extraction includes `type` and `accurateSpelling`; code uses key/value rows; do not interchange strict row types. |
| Add/calibrate structured post-call dispositions. | Separate draft/revision/estimate/publish, pinned dependencies and test population; replay vs newly edited target; not an agent snapshot or judge identity mutation. |
| Configure an alert or integration whose endpoint is absent from this wiki. | Advertised authenticated docs/API discovery, current schema, separate ownership/scope; no invented URL or browser workaround for missing API tools. |

Do not count confident unsupported details as coverage. A precise capability
limit is a valid answer. This is a knowledge evaluation, not proof that live
tools or every customer feature are available.

## Pre-expansion baseline

The plugin answered judge/version workflows, but could not explain transfer
evidence or execution phases sufficiently. It omitted node families and separate
administrative surfaces; extraction prose omitted fields emitted by its own
materializer. Its lifecycle guidance incorrectly asserted checks never block
promotion. These are the failures the updated references must address.
