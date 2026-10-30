# Upgrade mode: outcomes-v1

Use this contract only for `/norm:migrate --upgrade` or a migration state whose
`mode` is `outcomes-v1`. A state without that mode retains the legacy contract;
resume it without changing acceptance criteria. Native `/norm:build` shares the
hub-first authoring guidance, not this upgrade acceptance contract.

This contract overrides conflicting verbatim-carriage, source-bug-preservation,
scenario-count, hub-shape, materializer-only authoring and retry-to-green guidance
in `v2-migration`, its traps, `/norm:migrate`, `/norm:validate`, and `/norm:simulate`.
Read those references for dialect, capabilities and runtime traps, plus
`v2-authoring`, `v2-snapshot`, `v2-runtime`, and `v2-testing`. Apply native authoring
best practices to the customer's requirements; do not copy known conversational
defects to match v1.

Read [upgrade-input-state-v1.md](upgrade-input-state-v1.md) before freezing tests
for input inventory, source fixture preservation, state checkpoints, failure
diagnosis and the final resource/evidence report.

## Requirements and design

First read [call-quality-v1.md](call-quality-v1.md): the supplied good/bad-call
definitions govern what outcomes mean throughout design, tests and improvement.
Read [bland-tone-v1.md](bland-tone-v1.md) alongside it for the canonical SERVER
evals speaking-style standard. Keep tone, task outcome and caller sentiment
distinct, with the reference's explicit evaluation-evidence limits.
Then use the outcome-first design brief and hub/simple-scenario/complex-scenario
boundary rules in [upgrade-design-v1.md](upgrade-design-v1.md). Design the jobs
callers need completed before choosing any nodes. Keep ordinary conversation in the hub. Use scenarios for strict business
workflows and return to the hub when they finish or safely change intent.

Before authoring, write a requirement map with these slots:

- Business outcomes, policies and eligibility rules, with source evidence.
- Exact mandatory/legal wording, clearly distinguished from editable prose.
- Input/output variable contracts, source pins and integration behavior: tools,
  webhook methods/auth/body/response mappings, transfer destinations, KB scope,
  tags, timing and failure handling.
- Suspected business-rule mistakes for owner review; do not silently change policy.
- Required test lanes, recovery behavior and lanes that cannot be safely tested.

Apply the migration skill's separate executable/display-code inspection to every
pinned custom-code step. Carry readable, credential-redacted editor source and
verify the actual pin contents; a comment-only placeholder is not implementation
evidence. Display redaction and successful local fixtures do not resolve a
hardcoded credential in a live executable pin. Keep that readiness finding open
until the authorized secure replacement pin and its contract have been verified.

Design a native v2 agent around that map. Rewrite prompts, merge repetitive
questions, move extraction, and change scenario boundaries and routing where they
improve calls. Preserve mandated wording and integration contracts. Use the
materializer as a starting point when useful; editing the snapshot directly is
allowed in this mode. Scenario counts and an arbitrary hub layout are not proof
of quality. Keep reachable termination, safe routing and valid native structures.
Configure native capture fields (including `captureAs` and applicable capture
settings) before the final candidate push. Avoid redundant prompt-driven readback
when native capture handles confirmation. Evaluate the final capture configuration
on that exact version; do not append an automatic capture edit after scoring.

Run the audit with `--upgrade`. Checks P7, P8, P11, P12, P13, P14, P16, A2 and
A3 are explicitly skipped. A1 remains mandatory: every automatic entry path
(inbound, entryScenarioId, initialization routes) is connection gating only.
Upgrade mode imposes no step-count ratio or minimum scenario count. Capability checks remain: source pins/tools/transfers/
webhooks/code tools (P1–P5), KB IDs (P15), and tags (A6), including capabilities on
renamed, merged or dropped source nodes. A dropped-node declaration cannot excuse
lost capabilities. P9 preserves each distinct variable-to-capture mapping once;
P17 preserves extraction keys without fixing their step location. P10 accepts
reachable in-flow termination as well as root termination; simulations must prove
the actual terminal lane. Structural and routing checks still apply.

The authoritative SERVER audit additionally checks the executable compiled
candidate, rather than accepting capability IDs or fields placed anywhere in
snapshot JSON:

| Check | Required executable behavior |
|---|---|
| S9 | The candidate compiles to an executable pathway. |
| P18 | A reachable webhook retains its source request and response contract, including method, auth, headers, body, response mappings, timeout and retries. |
| P19 | Source snippet inputs remain paired with the matching executable snippet ID and version, including valid hub-attached `custom-code/run_snippet` tools. |
| P20 | A reachable transfer retains its destination and transport settings, including applicable warm-transfer behavior. |
| P21 | A reachable SMS step retains its message and sender. |

Local `norm-migrate-audit.cjs --upgrade` is a weaker advisory check and does not
implement every SERVER compiled-contract check. A green local audit is not
platform acceptance. The design checks in
[upgrade-design-v1.md](upgrade-design-v1.md) and frozen evaluation evidence are
additional requirements, not substitutes for executable capability checks.

## Record responsibilities and knowledge scope on the candidate

Read [upgrade-design-v1.md](upgrade-design-v1.md) before authoring. Map every
source responsibility to reachable native steps and frozen tests, classify every
knowledge source with evidence, and preserve scoped retrieval without root
leakage. Ordinary goals may share the hub. Strict workflows retain separate
conversational ownership; optional boundaries require the comparative evidence in
the design reference. No goal needs an artificial split. Unresolved scope prevents completion.

After every candidate push, run `record-design --file design.json` with the
returned `head_version_id` and mirror `state.design` into managed state. Run the audit and mirror the design before simulations. End the managed turn
for platform preflight; repair architecture or capability failures before
spending on the frozen repeated suite. The local
hook checks current-head metadata; the platform verifies the compiled design.
Metadata does not prove semantic coverage: review the source classification and
run assertions proving answers, continuation and absence of scoped leakage.

## Freeze the evaluation before the first candidate push

Create reusable test scenarios targeting the v2 agent. Store fixture request data
on those scenarios, with safe test data and approved integration boundaries. Each
scenario needs required assertions named `outcome: ...` and `conduct: ...`. The
suite also needs at least one required `recovery: ...` assertion. Optional
`quality: ...` assertions report conversational quality separately. Use supported
deterministic assertions for observable state, and calibrated `LLM_JUDGE` assertions for
semantic requirements. Required judges return boolean results. Optional quality
judges return boolean results or numeric scores normalized to 0–1, with the scale
stated in their prompt rubric; do not use raw 1–5 scores. Missing or invalid
numeric quality results are reported as unscored. A tone placeholder or an unimplemented webhook assertion
is not evidence. Meaningful criteria must explain success and failure, including
the customer's specific outcome and conduct requirements.

Initialize and record the complete suite before pushing the first candidate:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" init \
  --upgrade --snapshot snapshot.json --source v1-export.json --agent <agentId>
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migration-state.cjs" record-evaluation \
  --scenario <scenarioId> --scenario <anotherScenarioId>
node "${CLAUDE_PLUGIN_ROOT}/bin/norm-migrate-audit.cjs" \
  --upgrade --snapshot snapshot.json --source v1-export.json
```

The state contains `mode: "outcomes-v1"` and
`evaluation: {"scenario_ids": ["..."]}`. Keep this in the managed runner's mirrored
`.norm/migration.json` too. The platform freezes the first valid list in its
checkpoint with a server-owned `frozen_at` timestamp. In managed runs, mirror the
complete suite and **end the turn for the platform to checkpoint it before the
first candidate push**. Wait for that checkpoint acknowledgement before pushing.
Do not remove, replace or shrink the list. Scenarios, assertions and fixtures stay
frozen for the whole job, including later candidate versions. Edits invalidate the
job's evidence; correcting a test requires a new evaluation/migration run. There
is no in-run reset. Customer-authored scenarios and independent cases remain necessary
for production approval; a valid assertion shape does not establish that the
builder's suite covers every business requirement. Include independent cases
and report scenario provenance (customer-authored, independent, or builder-authored);
independence is a review requirement, not an automatically enforced claim.

## Run the pinned suite and count every attempt

After a successful audit, push the candidate using the normal org identity and
authorization rules, then record its returned version ID. Use
`POST /v1/agent-testing/simulation-sets` with `agent_version_id` set to that exact
candidate, the frozen `scenario_ids`, and `simulations_per_scenario: 3` (or more). Do not pass a
`request_data` override; runs must use the frozen scenarios' fixtures. Confirm
actual `metadata.agent_version_id` and persisted `assertion_results` for each run;
a requested pin or top-level completed status alone is insufficient.

Count **all attempts** on the candidate version. Failed, errored, cancelled,
pending and missing-result runs remain in the denominator and block acceptance;
never replace them with a later passing run. A changed agent requires a new
version and a full sweep of the frozen suite. Do not retry-to-green on the same
version. If a fixture or assertion was wrong, report the invalidated evidence and start a
new evaluation/migration run with the corrected suite. A new candidate version
alone does not authorize editing the frozen tests.

`record-sims --head <versionId> --passed true|false` is a local advisory record.
The Stop hook checks the live audit, local push freshness, current-head design
metadata and that sim record; it does not independently retrieve or verify
assertion evidence or establish semantic requirement coverage. Managed completion is
subject to the platform's independent checks of the frozen suite and all
persisted attempts. The hook records `released: "local_complete"` in upgrade mode: local readiness is
not proof of platform acceptance.

## Good and bad call benchmark

Read [call-quality-v1.md](call-quality-v1.md) for the common outcome rubric. Use its ten outcome definitions to design representative scenarios and classify call evidence. Calibrated `bad_call`, `nothing_to_fix`, `accomplished`, and `sentiment_worsened` come only from the exact versioned scorer and matching deployment thresholds. Report missing call-scoring evidence as unscored. Keep required scenario correctness checks independent: `caller_ineligible` and `caller_abandoned` are review flags even with correct agent behavior. Do not change policy to reduce them.

## Report

Report required pass numerator/denominator, required failures, optional quality
scores separately, candidate version, evidence run IDs, requirement coverage,
behavioral changes and suspected rule mistakes. List uncovered lanes and why they
remain unverified. Mark voice latency and audible interruptions **unverified**
when only text simulations were run. Never describe tone placeholders, untested
webhooks, or a green local record as proven call behavior. Automated capture edits
after the evaluated version invalidate that evidence and require review.

## Managed evaluation feedback loop

The managed platform runs the canonical outcome and Bland Tone hooks after the
simulation sweep when the authoring turn ends. These separate judges inspect full
transcripts; the source capability and business assertion gates remain binding.
Read their feedback, diagnose setup versus behavior, repair the smallest causal
problem, push a new candidate, and repeat all frozen cases at least three times.
Every attempt counts. Never edit expectations, discard failures or retry a judge
until it agrees. Platform checkpoints preserve claims and verdicts across worker
recovery. Read [bland-tone-v1.md](bland-tone-v1.md) for the actual scoring contract.
Stop as needs-review when evidence is unavailable or the bounded loop expires;
passing simulations do not establish audio quality or production perfection.
