# Tools, code, webhooks, and handoffs

## Pick the execution mechanism

| Mechanism | When it acts | Important boundary |
|---|---|---|
| Attached tool on a conversation step | When invoked during that step's conversation | `feed_context` versus `feed_context_and_route`; model availability does not mean invocation. |
| Saved-tool step | On traversal of an org-owned `toolId` | Confirm definition, overrides and staging selection before replaying. |
| Webhook step | On execution, with declared request/extraction/response mapping | HTTP success is not business success; retries can repeat side effects. |
| Code step | Executes its saved snippet pin, with explicitly mapped inputs | Editing `code` does not update `snippetId`/`snippetVersion`. |
| Workspace code used by Norm | Analysis/editing through host-provided tools and the Bland API | Different execution environment from a code step inside a customer's call. |

Use the existing generic MCP/API primitive and documented endpoints. Do not
introduce another service or expose API keys to make an integration work. Stored
tool, snippet, knowledge and secret identifiers remain org-scoped references.

## Author and debug a tool safely

1. Inspect the current saved definition, schema, auth mechanism, selected
   environment and any node overrides. Preserve unrelated fields and pins.
2. Trace each input to its producer: fixture, extraction, environment binding,
   earlier response or code output. Undefined and literal `{{missing}}` are not
   equivalent to valid input. Keep credentials out of reports.
3. Distinguish transport timeout/error from a returned unsuccessful business
   result. Inspect status, response body and variable mapping separately.
4. Apply response routing in the correct dialect: attached rows use
   `label/variable/condition`; standalone webhook/tool rows use
   `variable/operator/value/targetNodeId`. Do not interchange them.
5. Test match, fallback, error and repeated-entry cases. A tool's retry/call cap
   does not guarantee exactly-once effects. After an ambiguous write, inspect
   downstream state before retrying. Use idempotency only where documented.

Code snippets are separately saved executable resources. Use the current snippet
API through the authenticated connection, capture the returned id/version, update
the node's pair and test its declared inputs and output keys. Never execute an
arbitrary code buffer merely because it is displayed in the builder.

## Phone handoff versus pathway handoff

- **Cold phone transfer:** hand the caller to the selected destination without
  the warm consultation/merge conversation.
- **Warm phone transfer:** contact the transferee, run the consultation behavior,
  handle caller hold/recipient outcome, then merge when appropriate. Recipient
  answer, voicemail detection and successful merge are different events.
- **Transfer pathway:** change the running conversation graph to the specified
  pathway/version/start node. This is not a phone dial or v2 version promotion.
- **Studio redirect / SIP / application transfer:** use their supported dedicated
  fields and channel requirements; do not turn them into ordinary phone numbers.

For phone transfers inspect `transferNumber`, `transferExtension`, destination
type and the resolved value of any placeholder at the time of transfer. Inspect
the effective source/caller-ID policy separately. Do not infer universal override
priority from a displayed number; channel/call evidence and the current contract
must establish which value was used.

### Warm-transfer snapshot fields

The native authoring object is `warmTransfer`:

- `enabled`, `agentPrompt`, `mergePrompt`, `holdMusicUrl`, `timeout`,
  `voicemailMessage`.
- Optional `agentPromptStatic`, `mergePromptStatic`, `dtmfSequence`, `fromNumber`,
  `optimizeForIVR`, `allowMergeControl`, and `retry`.
- `timeout: null` means no custom timeout. Empty custom source/hold-music values
  do not mean “use an empty phone number/audio asset.”
- `retry` has `enabled`, `maxRetries` (additional dials), `delaySeconds`, `retryOn`
  and `allowPathwayRetry`. Supported outcome names include `voicemail`,
  `no_answer`, `busy`, `carrier_failure`; read live limits before authoring.

Do not copy compiled names such as `isEnabled`, `mergeCallPrompt`,
`isAgentPromptStatic` or `useCustomHoldMusic` back into this object. The authoring
schema and runtime graph are different dialects. Preserve older supported fields
on read/edit, but do not assume an unknown key becomes active.

### Evidence for a successful transfer

Collect resolved destination, attempt identity/status, recipient answer or
voicemail result, merge/handoff outcome and relevant recordings when available.
“I'll transfer you” in a transcript proves none of these. A text simulation can
verify routing intent but not carrier dialing, hold audio, DTMF or two-party
audio after merge. Test real handoffs only with authorized destinations and
bounded retries; do not call customer numbers merely to inspect configuration.

For failure, distinguish no dial, busy/no answer, recipient voicemail, consultation
failure, merge failure and post-handoff audio loss. Retrying every failure with a
different prompt obscures the layer that failed and can place duplicate calls.
