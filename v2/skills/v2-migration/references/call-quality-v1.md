# Good and bad call evaluation: call-scoring v1

This is the common outcome rubric for comparing migrated agents. It adopts the supplied **Call Scoring Prompt and Rules (October 27, 2026)**. The executable prompt and response boundary are the existing SERVER `apps/api/src/lib/callScoring/prompt.ts` and `compile.ts`; do not rewrite them as a generic quality judge.

The v1 prompt SHA-256 is `13c013cb9cc6c4d8d76ff08301df191b48163d05333bd1966e430a5bc0afc82d`. The code hash test pins the exact preamble, questions, definitions and order. A prompt edit or different deployment requires a new calibration. Use the full-precision thresholds recorded for the scoring deployment; the numbers below are the rounded display values from the supplied rules.

## What the scorer sees

One request per completed call: the exact preamble, state and four questions. Thresholds and derived booleans are not sent to the model.

Preamble:

> You are scoring a recorded phone call between a Bland AI agent and another party. In the transcript the agent's turns are marked "Agent:" and the other party's turns "Caller:".
> Definitions:
> - "Caller" means the human on the other side, whether they dialed in or the agent dialed out. A "Caller:" turn can also be an IVR menu, a voicemail greeting, hold music or silence; those are not a human.
> - "Purpose" means what the call was for. On an inbound call it is what the human called for. On an outbound call it is what the agent set out to do, as stated in its opening turns (a survey, a confirmation, a reminder, a payment, a sales pitch).
> - A transfer counts as completed only when the metadata says transferred: true.

State order: `direction` (inbound/outbound), `duration_minutes` (one decimal from seconds / 60), `transferred` (boolean), `ended_by` (or unknown), then the transcript. These come from the frozen call snapshot. Do not infer a transfer from an agent's promise.

Drop empty turns, merge adjacent turns with the same speaker label, label all non-agent speakers Caller, and use `(no transcript text)` when empty. At the estimated 28,000-token transcript limit keep the opening quarter and closing three quarters, and persist truncation. Reuse the shipped rendering/truncation implementation when running the scorer.

| Question | Instruction | Answer |
| --- | --- | --- |
| q_outcome | What was the outcome of this call? Choose the single best description. | Probabilities over all ten outcomes below |
| q_sentiment_start | How did the caller sound in their FIRST turns? Judge the caller's words only; ignore the agent. | negative, neutral, positive, none |
| q_sentiment_end | How did the caller sound in their LAST turns? Judge the caller's words only; ignore the agent. | negative, neutral, positive, none |
| q_fault | Was this a bad call: the purpose was not achieved and the cause was the agent, the platform, a phone menu the agent could not get through, or the human leaving or being blocked? | A single probability in [0, 1]; diagnostic only |

Sentiment: negative means frustrated, angry, upset or hostile; neutral means matter-of-fact, calm or businesslike; positive means friendly, pleased or enthusiastic. None means no human spoke: every Caller turn was a machine, voicemail, hold music or silence.

## Outcome definitions

| Outcome | Definition | Counts toward bad_call |
| --- | --- | --- |
| accomplished | The call achieved its purpose. Inbound: the human got what they called for, or a firm next step they accepted. Outbound: the agent achieved what it set out to do with the human: a survey completed, an appointment confirmed or rescheduled, a message delivered and acknowledged, a payment or order taken. | No |
| no_human | No human ever spoke and there was no way to reach one: voicemail, answering machine, no answer, wrong number, silence, or a phone menu with no option that leads to a person. | No |
| stuck_in_menu | The agent reached a phone menu or IVR that offered options it could have used to reach a person or complete the purpose, but it never got through. | Yes |
| declined | A human engaged, understood the purpose, and declined: not interested, not now, do not call, or they answered that the matter was already handled. | No |
| no_request | Inbound only: a human spoke but asked for nothing. | No |
| out_of_scope | The human asked for something the agent is not set up to do, and the agent said so or handled it as well as it could. | No |
| caller_abandoned | The human hung up or stopped responding while the agent was still handling things correctly. | Yes |
| caller_ineligible | Policy, identity verification or eligibility rules correctly blocked the purpose. | Yes |
| agent_failure | The agent caused the failure: it misunderstood the human, repeated itself or looped, gave wrong information, refused a valid in-scope request, or ended the call wrongly. | Yes |
| system_failure | The platform caused the failure: a transfer failed or was announced but never happened (transferred: false), a tool or lookup errored, the audio broke, or dead air was never recovered. | Yes |

## Scores and independent flags

| Flag | Score | Display threshold (>=) |
| --- | --- | --- |
| bad_call | P(agent_failure) + P(caller_abandoned) + P(caller_ineligible) + P(stuck_in_menu) + P(system_failure) | 0.611 |
| nothing_to_fix | 1 - bad_call; stored score key `legitimate` | 0.246 |
| accomplished | P(accomplished) | 0.204 |
| sentiment_worsened | Sum P(start=i) × P(end=j) over negative < neutral < positive where j < i; exclude none | 0.401 |

`q_fault` never feeds these flags. `nothing_to_fix` is not the boolean inverse of `bad_call`: each has its own threshold, so both can be true. Do not collapse them into a single good/bad label or treat non-bad as accomplished.

Correct eligibility refusal and caller abandonment remain bad-call review flags, even when the agent behaved correctly. Show their outcome probabilities separately from agent_failure and system_failure. Never relax policy, identity verification, opt-out handling or other required checks to improve the bad-call rate. A flagged call does not automatically fail a scenario expecting a correct refusal. Required business checks remain independent release gates.

## Evidence boundary

Use the existing call-scoring service and saved evidence. Each choice answer must contain exactly the required options, each probability in [0, 1], and sum to 1 within 1e-6. `q_fault` must be in [0, 1]. Input token usage must be a non-negative integer. Reject the whole response as `call_scoring_unavailable` when invalid; never repair, normalize or substitute a generic judge.

Freeze deployment, pinned revision, prompt version and threshold values for the comparison. Read the stored raw distributions, usage, threshold key/values and truncation marker from `disposition_run_scores.answers`, plus deployment, revision and prompt version from the score row. Associate that row with the frozen call and agent version. Choose the scoring run explicitly; do not silently pick a latest retry. A mismatched version, deployment, revision or threshold set is unscored for this benchmark.

Text simulations without a real completed-call snapshot do not establish these calibrated phone-call flags. Keep their scenario assertions and mark call-scoring metrics unscored. Do not fabricate duration, direction or transfer completion to obtain a score. The rubric can guide simulation scenario design, but an adapted simulation judge needs separate calibration and must not claim v1 scores.

## Benchmark report

For each variant and source report expected/scored/unscored calls, truncated calls, the four flag counts and rates, and the mean probability of every outcome. Rates use scored calls and always show coverage. An incomplete cohort is not evidence of improvement. Preserve individual call IDs, candidate versions, distributions and calibration for investigation and recomputation; no transcript is copied into this report.

Compare the same caller situations with the same rubric/calibration. Keep requirement pass rates, agent/system failures, and policy-correct refusal/abandonment visible alongside the aggregate bad-call rate. Audio and transfer claims still need the corresponding evidence.
