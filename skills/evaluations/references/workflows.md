# Reliable evaluation workflow

## Define before generating

- One judge = one observable dimension. A vague “good conversation” rubric is
  not reproducible; separate confirmation, correctness, resolution, and tone.
- Specify what evidence establishes each level and what is inconclusive.
- Keep passing direction explicit. “Issue observed” may be a failure even when
  a positive Boolean sounds like a pass.
- Decide text versus audio based on the claim, not convenience. Silence,
  overlap, pronunciation, or audible emotion requires appropriate audio.
- A test scenario needs a caller goal, all necessary fixture values, and clear
  behavior. A saved cohort contains existing calls; it generates nothing.

## Calibrate the judge

1. Choose a small known cohort with a clear pass, clear fail, and missing-evidence
   case. Use authorized test data, not fabricated production-call results.
2. Create identity and edit the judge version via the [API map](api.md).
3. Estimate and run against those calls, retaining the actual judge version.
4. Compare each verdict with the known evidence. Fix the rubric or evidence
   selection when it disagrees; do not rewrite the reported score by hand.
5. Repeat on the same cohort and record changes. Publish only within scope.
   During calibration, inspect whether the selected API supports the current
   draft; never assume a generic “drafts cannot run” rule across all surfaces.

## Simulate and score

- Use synthetic fixtures and check every reachable integration for side effects.
- Attach the intended judge versions to the test case; fetch the roster back.
- Start the `/simulate` operation once. Record `simulation_set_id` before polling.
- Follow assembled results, then linked evaluation details. Generation finishing
  does not establish that scoring finished.
- Check both behavioral assertions and execution coverage. A completion status
  or a summary with no configured pass threshold is not a universal quality pass.
- Keep the voice-agent candidate stable throughout the comparison. If the
  endpoint cannot pin it, record the resolved version and disclose that limit.

## Existing-call batches

- Build a bounded, reproducible cohort through the API; see
  [call analysis](../../call-analysis/references/retrieval.md).
- Freeze selected call IDs, judge versions, weights, targets, and threshold.
- Estimate, submit, persist run ID, follow status, then page through results.
- Match returned IDs to submitted IDs. Show scored, failed, insufficient, and
  missing counts independently; never silently shrink the denominator.
- A target-match rate and a weighted composite score are different metrics.
  Use the API summary for official rollups and label any local calculations.
- Preserve frozen judge snapshots so later rubric edits do not change the
  interpretation of an earlier report.

## Diagnose outcome, not just status

| Evidence | Meaning / response |
|---|---|
| `failed:true` or execution error | The judge did not successfully score; investigate the service/input, not the agent's quality |
| `is_insufficient_evidence:true` | The available evidence does not support a verdict; request relevant evidence or revise the dimension |
| Successful result with `is_target_match:false` | A genuine non-passing rubric result; inspect quotes and actual behavior |
| `PARTIAL` run | Some work is incomplete/failed; report coverage and affected IDs |
| Empty in-progress result | Continue following the same job; do not create duplicate runs |
| Passing score with wrong version/fixture | Does not verify the requested candidate |

End with a compact report: target/version, judge/version, cohort, run IDs,
terminal status, counts, passing criterion, evidence-backed failures, and
untested cases. Do not expose model/provider fields from raw audit payloads.
