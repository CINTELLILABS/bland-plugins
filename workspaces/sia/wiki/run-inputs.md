# Run inputs

Select the supplied cohort manifest explicitly with `node scripts/inspect-run.cjs --manifest <manifest> summary`. Retain the selector on paged views. The command returns a private artifact path and byte count; read the JSON file directly, keeping transcripts, summaries, prompts and error details out of console logs. The manifest pins the call membership, scoring definition and credential-redacted call-time configuration. A scored call is a lead, not a diagnosis. Missing transcripts, outcomes and failed lookups remain coverage gaps.

Keep the input bundle immutable. Record per-call coverage, evidence and progress in the run's private working directory. Each candidate starts from the same pinned baseline and has its own allowed paths, diff and test results. Never infer population prevalence from a sample or infer call-time version from scoring time.

The initial hosted `sia-selection` manifest contains the batch step’s call and version references, not scoring payloads or a baseline. The inspector supports its summary/list views and reports uncached evidence. Use separately supplied evidence attachments; do not infer missing scores, transcripts or configuration.
