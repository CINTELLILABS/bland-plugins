# V2 node catalog and authoring boundaries

This is a navigation and behavior reference, not a replacement for the current
snapshot schema. Preserve supported fields when editing. A node type existing
in a schema does not guarantee every channel, account, or older deployment can
execute it. See [runtime mapping](../../v2-runtime/references/builder-runtime-map.md)
for generated routes and [execution](../../v2-runtime/references/execution-order.md).

## Graph and verification containers

| Type | Purpose and important distinction |
|---|---|
| `inbound` | Call-entry marker; its edge selects the actual initial node. |
| `agent` | Conversational hub with instructions and eligible entry routes. |
| `scenario` | Simple scenario card; do not assume every scenario has a nested flow. |
| `complex-scenario` | Nested flow with entry, Start edge, executable steps and exits. |
| `start`, `end` | Nested-flow boundaries. Array order is layout convention; Start's edge selects entry. End is not a phone hang-up. |
| `end-call` | Conversation termination: says its line, then hangs up. At the root it is entered by its entry criteria; as a step inside a flow it is entered by the flow's edges. Verify the actual termination, not just an End pill. |
| `auth`, `complex-auth` | Verification cards, including legacy inline verification flows; preserve their gates when editing. |
| `auth-zone` | Protected region; child membership uses `parentId`. Simple/complex modes describe verification configuration, not permission to enter unverified. |

Auth is not just a prompt saying “verify first.” Choosing a protected destination
can redirect through its zone's verification flow. Moving a child out of its
zone, changing its parent, or routing around the verification changes protection.
Do not flatten these structures during cosmetic cleanup or to fix a missing arrow.
Test verified and unverified callers and attempted topic changes into protected
content; inspect the executed path. UI presence is not proof of authorization.

## Conversation, data, and actions

| Type | Key configuration | What to verify |
|---|---|---|
| `prompt` | `prompt`, `useStaticText`, `loopWhile`, extraction `variables`, `tools`, `settings` | Generated versus static speech; goal/loop release; real tool results. |
| `waitForResponse` | Prompt-step fields | Waiting for caller input is intentional, not necessarily latency or a stuck route. |
| `knowledge` | Node `kbIds` and prompt fields | Retrieval scope and actual evidence; different from call-wide knowledge. |
| `tool` | Saved `toolId`, `overrides`, `isStaging`, response routes | Org-owned definition and environment, request/result, chosen response target. |
| `webhook` | HTTP fields, optional extraction, auth, timeout/retries, `responseData`, response routes | Transport result versus business success; response-to-variable mapping. |
| `customCode` | `snippetId` + `snippetVersion`, declared inputs; `code` is editor copy | Executed pin and output, not displayed source. |
| `route` | Ordered rules, AND conditions within a rule, `fallbackNodeId` | First matching rule; no-match without fallback fails. |
| `channel` | Ordered channel sets and targets, `fallbackNodeId` | First matching channel rule; unmatched channel needs fallback. Empty draft rules do not execute. |
| `sms` | `fromNumber`, `message` | Actual delivery result; a text node can create a real external message. |
| `transfer` | Destination, phone/application type, warm-transfer policy, prompt and loop | Dial, answer and merge outcomes; see [handoffs](../../v2-runtime/references/tools-and-handoffs.md). |
| `transferPathway` | `pathwayId`, pathway `version`, optional `startNodeId` | Transfers execution to another pathway, not another v2 agent or a phone number. Its version vocabulary is not v2 semver. |
| `playAudio` | `audioUrl` | Accessible asset and actual audible playback on the tested channel. |
| `pressButton` | `mode: digit\|sequence\|agent`, digit/sequence/prompt | Sends DTMF; continuation follows the step's outgoing route. |
| `ivr` | Prompt, loop, extraction and optional survey | Interaction with an automated menu; wizard survey is editor state, not execution. Voice testing is needed for tones/timing. |
| `scheduling` | Availability HTTP request, response mapping, optional slot locking, failure target | Availability is not a booking. Confirmation requires the scheduling pass condition; custom `loopWhile` adds to it. |
| `twilioFlowRedirect` | `flowSid`, redirect variables; `flowName` is display | Hands the call to a Studio flow; ordinary outgoing edges do not establish continuation afterward. |
| `amazonConnect` | Prompt and `webhookUrl` | Receives DTMF and sends collected tones/call identity to the configured endpoint. Requires compatible telephony. |
| `resetSttLanguage` | Supported `language`, optional `targetNodeId` | Changes speech recognition language, not translation of the whole prompt; target or onward edges determine continuation. |
| `smsOtp` | `codeLength`, expiry, `messageTemplate` containing `{{code}}`, attempts, delivery method | Real delivery and verification evidence; never print OTP values. |
| `identityQuestions` | Ordered questions with expected answers and required flags; optional tools | Conversational verification against supplied known answers; not equivalent to deterministic OTP validation. |

Identity questions use required answers as the pass condition. They do not
implicitly supply an attempt budget or failure branch. If a caller cannot
answer, design the supported exit/escalation explicitly rather than inventing
`maxAttempts` on this node. Expected answers must come from authorized fixtures
or upstream lookup, not be fabricated from the caller's unverified assertions.

Scheduling's availability request can run on entry and again when more slots
are requested. Its fixed confirmation bar is not replaced by the custom loop.
When slot locking is configured, inspect its result before claiming a booking.
Test empty availability, timeout, rejected lock and retry separately. These are
real integration operations unless the host explicitly supplies a test substitute.

## Variable rows: two different contracts

Extraction rows on conversational steps include type and spelling mode:

```json
{"id":"6c64eae2-9504-4971-83f9-507846989915","key":"reason","value":"The caller's reason for contacting support","type":"string","accurateSpelling":false}
```

`type` is `string`, `number`, `boolean`, or `json`. `accurateSpelling` requests
precision when appropriate; it is not evidence the extracted value is correct.
An optional `captureAs` (`name.first`, `phone`, `address.street`, …) turns on
capture for the value: it is read back and confirmed with the caller.
Code-input rows are key/value mappings, not extraction instructions:

```json
{"id":"74da51db-b958-4260-80da-b3184d2d3db0","key":"reason","value":"{{reason}}"}
```

These are row fragments, not complete version-create payloads. Preserve stable
IDs; validate the containing node and snapshot. Do not add extraction-only fields
to strict schemas for a different row type.
