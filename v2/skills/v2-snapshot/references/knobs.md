# Every knob in the snapshot — what it does, what's inert, what's deprecated

Field-by-field reference for authors. STATUS meanings: **ACTIVE** (the compiler/runtime consumes it), **EDITOR-ONLY** (persisted for the editor, never executes), **DROPPED** (silently discarded at compile), **NONEXISTENT** (a v1 concept with no v2 spelling — authoring it does nothing or fails). Facts here are compile-observable: a knob is ACTIVE iff it changes the compiled graph or runtime behavior.

## Agent-level `settings`

| Knob | Status | Behavior |
|---|---|---|
| `systemPrompt` | ACTIVE | The agent's global brain; applied on every step of every scenario. |
| `displayName` | ACTIVE | Agent display name. |
| `voice` | ACTIVE | Voice id; `""` = platform default. |
| `languages` | ACTIVE | e.g. `["english"]`. |
| `interruptionSensitivity` | ACTIVE | CALL-level interruption baseline (number, e.g. 350). Distinct from the per-step `interruptionThreshold`. |
| `backgroundNoise` | ACTIVE | `"off"` or a track preset — call-level baseline; steps can override via `advanced.backgroundTrack`. |
| `enableMemory` | ACTIVE | Cross-call memory toggle. |
| `reactions`, `tapbackReactions` | ACTIVE | Chat-channel reaction config. |
| `voiceCall.enabled/.record/.fallbackNumber/.maxDurationMinutes/.noiseCancellation/.ignoreButtonPress` | ACTIVE | Voice-channel behavior; `record: false` = no recording. |
| `voiceCall.requestData`, `voiceCall.metadata` | ACTIVE | Default request-data/metadata rows for voice calls. |
| `webChat.*` | ACTIVE | Web-chat widget config (enabled, widgetTitle, greetingMessage, allowedOrigins). |
| `contact.inboundNumbers` | ACTIVE (required) | Must be an array — the platform validator rejects the snapshot without it. |

## Step `settings.advanced` (all omit-when-default; absence = default)

| Knob | Default | Status | Behavior |
|---|---|---|---|
| `temperature` | 0.2 | ACTIVE | Emitted only when ≠ 0.2. |
| `interruptionThreshold` | null | ACTIVE | Per-step interruption override (ms-ish score, e.g. 573/800/900). null = inherit call baseline. |
| `skipUserResponse` | false | ACTIVE | Step acts without waiting for a caller turn (silent pills, code steps). Must live HERE — a top-level key of the same name is not a v2 spelling. |
| `blockInterruptions` | false | ACTIVE | Compiles to `block_interruptions`. |
| `interruptibility` | null | ACTIVE | Fine-grained interruptibility override. |
| `agentBackchannelLevel` | null | ACTIVE | null = inherit call baseline; **0 = explicit OFF** (the one value that must be emitted to mean off); >0 enables per-step murmurs. |
| `agentBackchannelConfig` | — | ACTIVE, gated | `{continuersOnly, blockedTokens[]}` — only emitted when riding an enabled level (>0); with level null/0 a stored config is DROPPED at compile (would contradict off/inherit). |
| `backgroundTrack` | "" | ACTIVE, tri-state | `""` = inherit the call-level track; `"off"` = explicitly silence at this step; any other value = preset name/URL. |
| `disableRecording`, `disableLogging` | false | ACTIVE | Compile into `privacySettings` on the step. |
| `disableSilenceRepeat` | false | ACTIVE | Suppresses the silence re-prompt at this step. |
| `conditionOverridesGlobalPathway` | false | ACTIVE | This step's loop condition outranks global-node interruption. |
| `excludeResponseFromHistory` | false | ACTIVE | Step's response kept out of the transcript context. |

## Step `settings.global` — step-level GLOBALS exist in v2

| Knob | Status | Behavior |
|---|---|---|
| `isGlobal` | ACTIVE | true compiles the step into a runtime GLOBAL node — reachable from anywhere in the compiled agent when its label/description matches. false = nothing emitted. |
| `label` / `description` | ACTIVE (when global) | Compile to `globalLabel` / `globalDescription` — the fire-condition text. |
| `returnMode: "previous"` | ACTIVE (default) | Legacy auto-return: after the global speaks, return to the interrupted node. |
| `returnMode: "redirect"` + `forwardingNode` | ACTIVE | The redirect target generates the response. |
| `returnMode: "manual"` (+ optional `manualReturnLabel`) | ACTIVE | Disables auto-return (`enableGlobalAutoReturn: false`); the step's own drawn edges stay live, optional labelled route back. |

Design note: migrations to date have preferred systemPrompt folds / hub scenarios over step globals for carried v1 globals (deltas documented per migration), but the knob itself is live — a deliberate design may use it.

## Step-family data flags (prompt / transfer / end-call)

| Knob | Status | Behavior |
|---|---|---|
| `prompt` | ACTIVE | The step's instruction text (or static speech when `useStaticText`). |
| `useStaticText` | ACTIVE | true = `prompt` is spoken verbatim (a `"."` static prompt = the silent pill: nothing generated, nothing to fabricate). |
| `loopWhile` | ACTIVE | The v2 spelling of v1's node `condition` — hold criteria for the step. |
| `variables` rows `{id,key,value}` | ACTIVE | LLM extraction (prompt steps) — re-extracted per turn, values persist as call variables. On customCode steps: the EXCLUSIVE snippet input map. |
| `ignorePreviousExtractions`, `useAudioExtraction` | ACTIVE | Extraction modifiers. |
| `tag` | ACTIVE | Disposition tag carried onto the compiled node. |
| `media` | ACTIVE | Compiles to `mediaAttachments`. |

## `customCode` steps

| Knob | Status | Behavior |
|---|---|---|
| `snippetId` + `snippetVersion` | ACTIVE | THE executable artifact. Org-scoped: a pin from another org silently no-ops. Unpinned step = inert at runtime. |
| `code` | **EDITOR-ONLY** | Display copy for the editor/import; the runtime NEVER executes it. Do not rely on inline code. |
| `variables` | ACTIVE, exclusive | The only inputs the snippet receives (resolved against call variables; unresolved `{{x}}` passes as the literal). Returned object keys merge wholesale into call variables. |

## `route` steps

| Knob | Status | Behavior |
|---|---|---|
| `rules[].conditions[]` `{field, operator, value}` | ACTIVE | Conditions within a rule AND; rules are alternatives in order. Operators: `is`, `equals`, `contains`, comparisons. **v1's `equals` string quirk: prefer `is` for boolean-ish outputs — mirror what the source system's own routers use.** |
| `fallbackNodeId` | ACTIVE | No match + no fallback = hard runtime failure for that caller. Never omit unless the source truly had none. |

## `transfer` steps

`transferNumber` (supports `{{variable}}` destinations), `transferType` ("phone"), `transferExtension`, and `warmTransfer` `{enabled, agentPrompt, mergePrompt, fromNumber, holdMusicUrl, optimizeForIVR, useCustomFromNumber, useCustomHoldMusic, isAgentPromptStatic, useVoicemailMessage, voicemailMessage, voicemailResponseType}` — all ACTIVE. v1 spelling differences: `isEnabled`→`enabled`, `mergeCallPrompt`→`mergePrompt`.

## `webhook` steps

`url`, `method`, `headers` (as `{key,value}` ROWS — v1's `[key,value]` tuples are not the v2 spelling), `body`, `timeoutSeconds` (→ runtime `timeoutValue`), `maxRetries` (→ `max_retries`), `auth {type, token, encode}` (the supported auth mechanism — custom Authorization headers are the v1 trap), `responsePathways` rows `{label, variable, operator, value, targetNodeId}` (`label` unused — leave `""`), `responseData` rows `{name, path}` (JSONPath → variable mappings; v1's `response_data {name, data}` is not the v2 spelling).

## `tool` steps (saved org tools)

`toolId` (`TL-…`, org-scoped), `overrides` rows `{key,value}` (dot-paths into the tool def, e.g. `body.agent_email`), `isStaging`, `responsePathways` (same shape as webhook). Compile note: **draft response-pathway rows — missing variable or target — are silently DROPPED at compile.**

## Attached tools (`data.tools[]` on prompt steps)

`{id, name, description, behavior: feed_context|feed_context_and_route, toolId, definition, isStaging, excludeResponseFromHistory, retryLimit, maxCalls, responsePathways, toolType}`.

- **THE SKEW** (attached-tool rows only): `label` = trigger variable, `variable` = operator, `condition` = value.
- `toolType`: `custom_tool` | `track` ONLY.
- `maxCalls`: re-invocation cap — set it on every tool.

## Deprecated / inert / nonexistent — the trap list

| Knob | Status | Reality |
|---|---|---|
| `toolType: "code"` | NONEXISTENT | v1's snippet-backed attached tool has no v2 spelling. Re-represent as customCode step + route step (see the migration traps). |
| `customCode.code` | EDITOR-ONLY | Never executes; the pin is the artifact. |
| Top-level `skipUserResponse` on a step | NONEXISTENT | Only `settings.advanced.skipUserResponse` is real. |
| `agentBackchannelConfig` without an enabled level | DROPPED | Compile discards it. |
| Draft responsePathway rows (no variable/target) | DROPPED | Silently removed at compile. |
| Attached-tool rp field names read literally | TRAP | The skew (label/variable/condition) is deliberate; author in the skew. |
| v1 tuple spellings (`extractVars` `[name,type,desc]`, header `[k,v]` tuples, `response_data {name,data}`) | NONEXISTENT | v2 uses row objects; carrying v1 tuples verbatim produces inert or crashing config. |
| `contact` omitted | REJECTED | Validator requires `contact.inboundNumbers` as an array. |
