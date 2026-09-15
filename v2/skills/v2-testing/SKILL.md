---
name: v2-testing
description: Verifying a Bland v2 agent with platform simulations and test-chat probes — the agent-testing API contract, request-data fixtures, engine-trace grading, the test-chat WebSocket recipe, and testing-safety rules for live integrations. Use when setting up sims, grading results, running test chats, or deciding whether a test is safe to run at all.
---

# Testing v2 Agents

Two complementary surfaces: **platform simulations** (a tester persona talks to the real agent; LLM judges assert outcomes) and **test-chat probes** (you drive scripted turns over the builder WebSocket). Both run the real agent with real integrations — safety analysis comes first, always.

## Safety before any test

Classify every integration in the agent as read or write:

- **Reads** (CRM lookups, availability checks, pure-compute snippets): safe with synthetic data — use a caller identity that intentionally misses (e.g. a `from` number not in the customer's CRM) so no real PII enters transcripts.
- **Writes** (schedulers, CRM task creation, gate openers, outbound events): NEVER complete these branches in routine testing. Personas must stop short (decline the booking, stay on the unverified lane). Exercise them once, coordinated, with the customer aware — or against customer-provided sandboxes.
- **Transfers**: inert in chat/sims; they dial real phone lines on voice calls.

## Platform simulations

Create — `POST /v1/agent-testing/scenarios`:

```json
{ "agent_id": "…", "name": "MIG-FINAL: sales - new home quote",
  "tester_persona_prompt": "You are calling …. Your name is Jordan Testwell … (you are NOT a real customer — the system will not find you, and that's expected).",
  "max_turns": 12,
  "request_data": { "from": "+15555550100" },
  "assertions": [ { "type": "LLM_JUDGE", "name": "routed to sales", "is_required": true,
                    "config": { "prompt": "Did the agent …?", "output_type": "boolean", "pass_on_true": true } } ] }
```

- `assertions[].type` is an ENUM — `LLM_JUDGE`, `NODE_REACHED`, `WEBHOOK_TRIGGERED`, … Uppercase; lowercase is a server validation error.
- `request_data` supplies the call-time contract (e.g. `from` in E.164 for phone-keyed lookups; a real `now_utc` string when clock logic matters).
- Run: `POST /v1/agent-testing/scenarios/:id/run` (async — poll). Read: `GET /v1/agent-testing/runs/:id` — transcript in `chat_history`, judge verdict + reasoning in `assertion_results[]` (populates after completion). Do not treat `nodes_visited` as a route trace.

### Suite design

- ~1 scenario per terminal/lane of the agent: each transfer destination, each deflection, each close, plus conduct probes (AI disclosure, human-request).
- Personas must be COMPLETABLE: give them every fact the flow can demand (account numbers, confirmations), and make probe timing explicit ("ask on your FIRST turn") — a persona that can't finish wedges the flow exactly as a real broken caller would, and that's a harness artifact, not an agent bug.
- Judges grade outcomes and conduct, worded to ignore hang-up timing (v2 hangs up one turn later by design).
- Assertions encode the SOURCE system's actual behavior, not idealized behavior.

### Grading discipline

1. Never conclude from judge prose alone — pull the run's engine decisions (per-turn node/route decisions in the run detail / call log) and check the call was where you think it was.
2. Classify each failure: harness artifact (fix persona/request_data/assertion) · judge flake (rerun; 3 reps; read reasoning) · routing flake (harden the specific entry/edge description) · real bug (fix the snapshot).
3. The bar: the FULL suite green in one sweep on ONE version head — not a patchwork of passes across different heads.
4. A lane that a gate keeps you out of (CRM-found, verified-identity) is NOT covered by sims that ran around it. List uncovered lanes explicitly in the report.

## Test-chat probes (the builder WebSocket)

The real test chat surface (works for voice-style agents; the SMS preview endpoint does not):

1. `GET /v1/pathway/session` with your API key → `data.token`.
2. Connect: `wss://stream-v2.aws.<dc>.bland.ai/ws/connect/<placementGroup>?agent_chat=<agentId>&version_id=latest&token=<token>` (shared orgs: placement group `blandpathwaychat`, dc `dc8`).
3. Send `{"type":"setup","payload":{"requestData":[{"key":"from","value":"+15555550100"}]}}`, then `{"type":"text","payload":"<caller turn>"}` per turn.
4. Keepalive: a binary `[1]` frame every ~10s. A `pathway_end_call` close is a real hang-up. `callID` frames give you the call id for log retrieval.

Probes are for scripted mechanics (does the greeting fire, does lane X route, does the AI-disclosure rule hold) — drive fixed turns, print every frame, judge by eye + call log. A dead-silent socket against a dedicated placement group usually means that group's infrastructure predates agent test chat — test on the shared group or ask Bland.

## What testing cannot prove alone

- Lanes gated on customer data (CRM-found identities) need a customer-created test record.
- Write-side integrations need a coordinated customer-aware smoke.
- Warm-transfer audio behavior only shows on a real voice call.

Say these plainly in every verification report; a suite that is "12/12 green" while the most sensitive lane was unreachable is not a proven agent.
