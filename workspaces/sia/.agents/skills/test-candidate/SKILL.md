---
name: sia-test-candidate
description: Validate a local V2 repair and compare actual baseline and candidate behavior.
---

# Validate and test

For each issue, before editing, freeze cases for the observed failure, an evidenced successful same-version path, and relevant policy/error boundaries. Record source call/turns, complete relevant starting state, caller turns, tool bindings/arguments/mock responses, assertions and baseline hash; attach the candidate hash when executing. Acceptance prose alone is not an executable fixture. Resolve tool names and response fields against the pinned snapshot; do not invent observed state or force the desired result. Synthetic cases are useful but are not untouched holdout evidence.

Run the candidate check from the workspace root, using the selected manifest's `scope.agent_id` (or `agentId` for a `sia-selection` manifest):

```sh
node .agents/skills/test-candidate/scripts/check-candidate.cjs \
  --baseline RUN/baseline.json --candidate RUN/issues/ISSUE_ID/candidate.json \
  --allowed RUN/issues/ISSUE_ID/allowed-changes.json --agent AGENT_ID \
  > RUN/issues/ISSUE_ID/validation.json
```

This checks edit scope and hashes locally, then sends the baseline and candidate to the server's existing V2 snapshot validator through the managed `validate_agent_snapshot` tool. Inspect both validation results. A denied, oversized or unavailable validator is an evidence gap, not a validation pass. The validator does not validate deterministic routing operators; check changed operators against the supported product schema and record any unverified operator as a gap. Snapshot validation does not execute the agent or prove conversational behavior.

With an authorized runner, open separate baseline/candidate sessions under identical initial state, policy, runtime settings and fixtures. Drive the caller one text turn at a time; inspect replies, routing and tool results before responding. Keep scenario goals and assertions fixed, adapt naturally to changed replies, and retain exploratory findings separately. Select the call's behavior configuration explicitly; chat transport alone does not ensure parity.

Verify that the baseline reproduces the claimed failure, the candidate changes that behavior, and successful/adjacent cases remain valid. Keep failed and inconclusive traces; distinguish no reproduction, missing execution and regression. Correct a test only for an evidenced contract error and retain the correction.

Record `passed`, `failed`, `inconclusive` or `not_run` per case, plus executed/eligible coverage, duration, measured usage and remaining gaps. Use [testing](../../../wiki/testing.md) only for runner contracts.

-   `needs_evidence`: the causal diagnosis or policy justification is unresolved/contradicted.
-   `needs_execution`: a supported candidate lacks completed behavioral comparison. Distinguish executable fixtures from planned cases. This is a draft, even if static or isolated tool checks passed.
-   `behavior_checked`: supported diagnosis, exact baseline/candidate, reproduced failure, observed improvement, and passing scoped regressions with coverage gaps disclosed. This is prototype evidence, not voice acceptance or release.
-   `no_supported_fix`: no justified candidate in the bounded batch.

No local V2 behavioral runner is currently connected. Norm having a voice runner does not establish access to it here or support for unsaved candidates and mocked effects. Use [testing](../../../wiki/testing.md) to resolve that contract; do not call unimplemented tools or substitute model role-play for the engine. Record failures and gaps per issue, then continue the queue. Verify handoff is outside this prototype; finish with [report](../report/SKILL.md).
