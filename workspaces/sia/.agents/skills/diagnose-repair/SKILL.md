---
name: sia-diagnose-repair
description: Diagnose ranked Agent Fix issues and draft a separate, evidenced V2 repair for each.
---

# Diagnose and repair

Take the next Agent Fix from the ranked queue. State one falsifiable cause, its strongest alternative and the observation that separates them. Compare a reproducer with a same-version control. For routing/tool claims, inspect executed events and the relevant bound tool contract; a prompt conflict alone establishes a hypothesis. If event order contradicts it, revise the cause and ownership before creating a candidate.

Check customer outcome definitions and the governing policy, including global instructions, node prompts and tool-controlled exceptions. Distinguish unwanted behavior from intentional friction or deflection. A convenient route or a higher generic score does not authorize changing customer policy. If decisive evidence is unavailable, keep the issue unconfirmed and consider the next supported group.

Record the diagnosis, evidence/counter-evidence, affected/eligible count, confidence and repair rationale in the issue table **before editing**. In `RUN/issues/ISSUE_ID/`, freeze the [test-candidate](../test-candidate/SKILL.md) cases and intended JSON Pointer paths in `allowed-changes.json`. Use the exact baseline version/hash and preserve credential placeholders.

Copy the full immutable baseline to this issue's `candidate.json`; edit only its evidenced cause. Never stack another issue's repair into it. Preserve IDs, unknown fields, channel overrides, identity controls, destinations, tool contracts and customer policy. For a hosted `sia-selection` manifest, find the attachment named `agent-snapshot.json` in the turn's attachment list and read its staged file directly for nodes and prompts. This manifest has no `agent_configuration` reference, so the inspector's `nodes` and `config` commands do not support it. For pinned cohort manifests that include `agent_configuration`, use `inspect-run.cjs --manifest MANIFEST nodes --cohort RUN_ID` and `config --cohort RUN_ID --pointer POINTER` for targeted context. Consult [configuration](../../../wiki/agent-configuration.md) for V2 rules.

Keep the diff reviewable. Change the candidate only after a new observation or failed check warrants it; do not broaden allowed paths or weaken assertions to obtain a pass. Revalidate affected checks, then run the scoped suite once on the final revision. Record overlapping edits or dependencies on other proposals. Without a supported cause, mark `needs_evidence` or `no_supported_fix` rather than forcing a candidate.

Record this issue's outcome and continue to the next. A missing runner is `needs_execution`, not a reason to stop the batch. Finish with [report](../report/SKILL.md), including each proposal's exact V2 changes and remaining evidence gaps.
