---
name: sia-triage
description: Join scored calls to customer outcomes, screen the bounded batch and rank evidence-backed issue groups.
---

# Triage

Use `node scripts/inspect-run.cjs --manifest <manifest> summary`, then `list --offset N --limit 10` with the same manifest (`--flagged` narrows the view). Membership comes from manifests; score names come from the frozen definition. Never infer versions from CSV order or guess score UUIDs. The reader performs no classification.

Before ranking, use [call-evidence](../call-evidence/SKILL.md) to obtain customer disposition results for the batch and the exact definitions referenced by those results. Establish what success and exclusions mean. Keep customer outcomes, frozen scorer signals and your evidence-based judgment separate; null, absent, excluded and false are different. Customer labels can be wrong and need corroboration.

Screen every call's joined evidence. Use `call CALL_ID` for complete, paged turns; investigate high-impact signals, score/outcome disagreements and representative controls. A summary or keyword match identifies a lead, not a confirmed issue or cause.

-   Coverage: `not_reviewed`, `screened`, `reviewed`, or `evidence_unavailable`, with evidence references and a short observation. Map each substantive lead to issue IDs or an explicit dismissal/pending question. “No issue observed” requires reviewed evidence; never assign it merely because a call was absent from an issue list. Partial/transcript gaps remain visible.
-   Issues: **Agent Fix**, **Customer Fix**, **System Fix**, or **Other/Unknown**. Ownership requires evidence; retain a suspected owner separately when uncertain. Unwanted agent speech alone does not distinguish an agent configuration defect from missing context or runtime failure. Calls may support multiple issues. Missing evidence is a coverage state, not a ranked issue.
-   One issue table: version, symptom, confirmed/suspected call IDs, bucket, hypothesis, supporting and conflicting evidence, confidence, missing evidence, next action. Rank by customer impact, affected/eligible counts, causal confidence and repairability; explain the ordering and why alternatives were deferred.

Maintain stable issue IDs and a provisional ranking as evidence arrives. Hand supported Agent Fix issues to [diagnose-repair](../diagnose-repair/SKILL.md) in priority order; keep suspected causes queued until evidence resolves ownership. Report coverage separately from diagnosis confidence. Complete the queue with independent proposals or explicit unresolved/deferred outcomes, not just the first fix.
