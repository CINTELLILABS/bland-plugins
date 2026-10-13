# Evaluations and agent testing regression cases

Run a fresh agent with only the packaged `v2/` directory as its reference
source. No server code, no network calls. These cases grade explanations
("how does X work", "why did X happen"), not writes. Ask each prompt alone
and keep the answer plus every file the agent opened.

## Prompts

1. "I ran an eval on 40 calls with two judges and it came back `PARTIAL`,
   but no judge result says `failed`. Why, and is my agent failing?"
2. "My test case's simulation says `summary.passed: true`, but the
   'Confirms before booking' judge shows `passed: false`. Which one is right?
   And which version of my agent did that simulation even test?"
3. "Walk me through what actually happens when I press simulate on a test
   case. Who talks first, what does the fake caller know, and will my
   booking webhook fire?"
4. "I added a pass/fail judge to a test case and to an eval run. The chips
   say 'Passed' but the summary never counts it as on target. And my audio
   judge gave verdicts on every simulated conversation, so the agent's
   pacing is fine, right?"

## Rubric (not shipped to the agent)

- **Always:** answers from `evaluations/references/how-it-works.md` and
  `v2-testing/references/how-it-works.md` (or the references they link).
  Names observable fields and statuses, not implementation. Never names a
  judge model, a simulated-caller model, a provider, an inference host, an
  internal service or queue, a feature-flag name, or any judge prompt text.
  Does not quote the simulated caller's instructions. A leak of any of these
  fails the case regardless of correctness.
- **Prompt 1:** explains that a run is `COMPLETE` only when every submitted
  call is `COMPLETE`, and that a call with no scorable verdict ends
  `INSUFFICIENT_EVIDENCE`, which makes the run `PARTIAL` with no failures.
  Points at `summary.insufficient_evidence_count` and
  `failed_call_count`, and at the judges' reasoning on those calls. Says
  `PARTIAL` is a coverage statement, not an agent verdict; the agent's
  quality is read from scored verdicts and their denominator. Fails if it
  calls the agent broken from `PARTIAL` alone or invents a failure.
- **Prompt 2:** says `assertions[].passed` is the verdict (at least half of
  the conversations on target) and `summary.passed` only means every
  conversation was scored cleanly. The judge result wins: the test failed.
  For the version: the latest saved version (dev head) with dev variable
  values, recorded in a conversation run's `metadata.agent_version_id`;
  `/simulate` cannot pin another version for an agent case; a promotion
  check run scores a pinned candidate. Fails if it says the production
  version ran or that `version_number` selects an agent version.
- **Prompt 3:** the agent speaks first (greeting turn, no caller input);
  the simulated caller sees only its persona name, persona prompt and the
  transcript, never the agent's configuration; call inputs come only from
  `request_data`; the conversation runs in text on the agent's normal
  step-by-step runtime until the agent ends it, a closing step, or
  `max_turns` (default 20); conversations run one after another; scoring
  happens after all of them, in text mode. Yes, the webhook fires for real;
  transfers do not dial. Recommends a lookup-miss fixture and coordinating
  write lanes. Fails if it says the test is sandboxed or voiced.
- **Prompt 4:** pass/fail judges have no targets on their version, so
  `is_target_match` stays null unless the attachment lists `"pass"` as its
  target; the chip label comes from the verdict, the summary from target
  match. Fix: attach with `target_level_keys: ["pass"]`. Simulations are
  text: they are scored in text mode with simulation evidence only, and an
  audio judge there is scored as a text judge on the transcript, so its
  verdicts say nothing about pacing or sound. Prove audio with an audio
  judge on recorded calls, or a voice test. Fails if it blames the judge
  prompt, or treats the simulated audio verdicts as audio evidence.
