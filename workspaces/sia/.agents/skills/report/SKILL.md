---
name: sia-report
description: Persist a D&R run as ranked evidence and independent V2 fix recommendations with before/after visuals and actual test results.
---

# Report the run

Write `RUN/report.md` from [the template](../../../templates/report.md), and write `RUN/issues.json` and `RUN/coverage.json` from the same findings using `templates/issues.schema.json` and `templates/coverage.schema.json`. Keep the report useful without reading the session transcript; link detailed private artifacts instead of copying them.

Include every ranked issue, its owner/confidence, a concise evidence summary and two or three representative call IDs when available. Do not invent examples for a single-call issue. Distinguish confirmed instances from suspected matches and sample counts from population prevalence.

For each supported Agent Fix, give the cause, exact baseline and candidate, changed V2 nodes/fields, intended effect, and actual test results. Draw the affected before/after flow in Mermaid with real node names/IDs. For prompt or variable-only changes, show that field change rather than inventing a routing change. Link its diff and evidence. Mark unresolved issues without a speculative fix visual.

For Customer Fixes, record the action the customer needs to take and draft a concise message grounded in the evidence. Never send it. Each structured issue includes a stable ID, bucket/owner, priority, confidence, confirmed and suspected counts, representative call IDs, cause, distinguishing evidence, open alternatives, baseline version/hash and evidence references. Agent Fixes also include the independent candidate, changed JSON Pointers, diff, visual and actual test results. Store each test as passed, failed, inconclusive or not run with its execution evidence.

Check that each candidate differs from the same pinned baseline only within its declared issue scope. List overlapping paths/dependencies; do not present the proposals as a validated combined agent. Report `failed`, `not_run` and partial evidence plainly. No Verify handoff or publishing.

When the baseline is unavailable, set `baseline` to `null` and describe the missing evidence in `gap`. Only include `agentFix` when you have the baseline version and hash. For every `agent_fix` issue, set `recommendationStatus` to the same status used in the human report, including when the issue only records a gap.

Close the issue queue: every Agent Fix has a recommendation or a stated evidence/execution gap; pending work under a run limit stays explicit. Include start/end/duration, model, measured tokens, billing cost if available, data window/selection, coverage and capability gaps. Never include credentials, full transcripts or unnecessary personal details. Keep reports in the private run directory; external sharing needs an authorized destination. In hosted Norm, also return the complete concise report in the final response until file export is verified; saving a workspace file alone does not create a downloadable artifact.
