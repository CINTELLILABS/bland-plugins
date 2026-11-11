# Diagnose & Repair — {{customer}} / {{agent}} / {{run_id}}

{{One-paragraph result: highest-impact findings, supported independent fixes, and principal testing limit.}}

## Run

| Detail    | Value                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| Scope     | {{org_id · agent_id · call-time version · baseline hash}}                         |
| Inputs    | {{manifest link · call window · sampling rule · eligible/selected counts}}        |
| Execution | {{start/end UTC · duration · model · workspace revision}}                         |
| Usage     | {{input/cached/output tokens · measurement scope · measured cost or unavailable}} |
| Coverage  | {{selected · screened · execution-reviewed · unavailable · not reviewed}}         |
| Output    | {{supported proposals · unresolved issues · capability gaps}}                     |

## Issues by priority

| Priority / ID | Issue and customer impact                            | Owner / confidence                                    | Evidence and sample Call IDs                                             | Outcome                                  |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| {{rank / ID}} | {{symptom · affected/eligible in sample or unknown}} | {{Agent/Customer/System/Unknown · causal confidence}} | {{distinguishing observation · confirmed/suspected IDs · evidence link}} | {{proposal link or precise next action}} |

## {{Issue ID}} — {{independent fix}}

**Cause and evidence:** {{Cause, distinguishing observation, strongest alternative/counter-evidence, sample Call IDs.}}

**Proposed V2 change:** {{Exact node names/IDs and fields; before → after; why it addresses the cause and preserves customer policy.}}

{{Insert a Mermaid before/after diagram of the actual affected nodes or field wiring. Label it proposed. Link the full diff; omit unrelated graph regions.}}

**Artifacts:** {{baseline version/hash · candidate hash · diagnosis · candidate · diff · tests links}}

| Test                     | Actual result                          | Evidence / limit                        |
| ------------------------ | -------------------------------------- | --------------------------------------- |
| Baseline reproduction    | {{passed/failed/inconclusive/not_run}} | {{trace or missing capability}}         |
| Candidate behavior       | {{passed/failed/inconclusive/not_run}} | {{trace or missing capability}}         |
| Successful/adjacent path | {{passed/failed/inconclusive/not_run}} | {{trace or missing capability}}         |
| Policy/error boundaries  | {{passed/failed/inconclusive/not_run}} | {{trace or missing capability}}         |
| Static / isolated checks | {{result}}                             | {{exact scope; separate from behavior}} |

**Recommendation status:** {{needs_evidence / needs_execution / behavior_checked / no_supported_fix; retain failed regressions explicitly.}}

**Dependencies:** {{Overlapping edits or interactions with other proposals; each candidate is independent, combined behavior untested.}}

{{Repeat the fix section for each supported Agent Fix. For an Agent Fix with a gap and no candidate, give the gap and recommendation status.}}

## {{Issue ID}} — Customer Fix

**Evidence and action:** {{Distinguishing evidence, open alternatives, and the action needed from the customer.}}

**Draft message (not sent):** {{A concise, evidence-based request for the needed action.}}

## Structured artifacts

`issues.json` and `coverage.json` contain the same issue IDs, counts, evidence references and per-call coverage as this report. Keep each candidate independent and record actual test evidence, including tests not run.

## Remaining work

{{Unresolved/deferred issues, precise evidence/runner gaps, and any run limit reached. State what is needed next; no Verify handoff.}}
