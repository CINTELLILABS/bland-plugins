# Debugging loop

**Observe → reproduce → isolate → patch → verify → report.** Begin with one
specific expected behavior and the evidence contradicting it, not a general
rewrite of the agent.

## Collect the smallest sufficient evidence set

- Read the actual call/test run through the API, its target version, and relevant
  configuration. Preserve IDs and timestamps in workspace files.
- Read the transcript and routing/tool evidence together. For simulation traces
  see [testing](../../v2-testing/SKILL.md); for real calls see
  [retrieval](../../call-analysis/references/retrieval.md).
- If the issue concerns the visible page, compare fresh page context and unsaved
  draft with API state using [workspace reconciliation](workspace.md).
- If it concerns sound, retrieve an authorized recording and use
  [voice evidence](../../v2-testing/references/voice.md). Transcript text alone
  is insufficient for timing, overlapping speech, or pronunciation.

| Symptom | First discriminating check | Avoid |
|---|---|---|
| Wrong scenario / loop | Actual version, entry edge, current variables, routing priority | Rewriting every prompt |
| Tool did not fire | Was the intended node reached? Does it carry the expected tool/pin? | Assuming a tool failure from absent transcript text |
| Tool failed | Arguments, access, status, response mapping; fixture validity | Retrying an external write blindly |
| Missing variable | Initial request data → extraction → tool mapping timeline | Treating final variables as a historical trace |
| Eval failed | Execution error versus a valid non-passing verdict | Calling platform failure a bad agent response |
| Test passed but live call differs | Version/environment/channel and integration differences | Claiming text-test parity with real voice |
| UI shows old content | Fresh resource ID, draft revision, accepted saved state | Resaving blindly or reusing stale element IDs |
| Slow spoken response | Capture timeline by stage and clock | Attributing all delay to reasoning without evidence |

## Patch and regression check

- Preserve an untouched baseline and a reproducible fixture.
- Demonstrate the failure before the change when feasible; otherwise label it
  an unverified hypothesis and explain the missing evidence.
- Use code to make a minimal JSON change. Validate structure and routing, not
  just JSON syntax. Save only within the requested scope, then read back.
- Run the failing case plus neighboring branches and previously passing cases
  on the same saved version. Repeat nondeterministic probes and report counts.
- Treat customer integrations as real unless their sandbox is verified. Keep
  fixtures synthetic and disclose untested side-effecting branches.

## Report

State: cause supported by evidence; changed fields; saved version; run/call IDs;
passed / failed / inconclusive / not-run checks; safe artifact locations; and
remaining uncertainty. A reconnect or error is a visible incomplete outcome,
not a reason to silently declare success.
